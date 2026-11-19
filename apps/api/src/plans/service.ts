import type { Db, SqlTx } from '@projectx/db';
import { planWithinLimits, type PlanLimits } from '../entitlements/policy';
import { premiumRequired } from '../problems/access';
import {
  assembleDiagnostic,
  buildPlan,
  diagnosticReport,
  estimateMastery,
  PLAN_CONFIG,
  replan,
  type Candidate,
  type ChapterEstimate,
  type ChapterInfo,
  type Difficulty,
  type Evidence,
  type PlanDay,
  type PlanItem as AlgoItem,
} from '@projectx/plans';
import type {
  ChapterResult,
  CreateDiagnosticBody,
  CreatePlanBody,
  DiagnosticCreated,
  DiagnosticReport,
  PlanItem,
  StudyPlan,
} from '@projectx/contracts';
import { normalizeDecimal, sha256Hex } from '@projectx/shared';
import type { AppDeps, AuthUser } from '../deps';
import { ApiError, notFound, validation } from '../lib/errors';
import { iso } from '../lib/http';
import { istDate } from '../problems/service';
import type { SessionRow, Store } from '../repositories/types';
import { buildPracticeQuestions, createSession } from '../services/practice';

/**
 * Diagnostic + study plans (Tabby Plus). The algorithm is @projectx/plans (pure); this module only gathers evidence from the
 * database, runs it, and stores the result. Everything is recomputed from attempts the server graded; nothing the client says
 * about correctness or completion is trusted.
 */

type Deps = Pick<AppDeps, 'config' | 'logger' | 'clock'>;
const DAY_MS = 86_400_000;

interface ChapterMeta {
  id: string;
  slug: string;
  name: string;
  subject_id: string;
  subject_slug: string;
  subject_name: string;
}

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

async function chapterMeta(tx: SqlTx, ids: string[]): Promise<Map<string, ChapterMeta>> {
  if (!ids.length) return new Map();
  const { rows } = await tx.query<ChapterMeta>(
    `select c.id, c.slug, c.name, s.id as subject_id, s.slug as subject_slug, s.name as subject_name
       from public.chapters c join public.subjects s on s.id = c.subject_id
      where c.id = any($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Eligible problems (families) for a diagnostic in the given chapters. */
async function candidates(tx: SqlTx, userId: string, examId: string, chapterIds: string[], plus: boolean): Promise<Candidate[]> {
  const { rows } = await tx.query<{ family_id: string; chapter_id: string; subject_id: string; difficulty: Difficulty; qids: string[]; tried: boolean }>(
    `select f.id as family_id, f.chapter_id, f.subject_id, f.difficulty::text as difficulty,
            array_agg(q.id order by q.id) as qids,
            exists (select 1 from public.user_family_status u where u.user_id = $1 and u.family_id = f.id) as tried
       from public.question_families f
       join public.questions q on q.family_id = f.id and q.publication_status = 'PUBLISHED' and q.answer_key is not null
      where f.exam_id = $2 and f.chapter_id = any($3::uuid[]) and f.difficulty is not null
        and ($4::boolean or (f.access_tier = 'FREE' and q.access_tier = 'FREE'))
      group by f.id
      order by f.number`,
    [userId, examId, chapterIds, plus],
  );
  return rows.map((r) => ({ familyId: r.family_id, questionIds: r.qids, chapterId: r.chapter_id, subjectId: r.subject_id, difficulty: r.difficulty, tried: r.tried }));
}

/** Resolve the diagnostic's scope: exam, subjects and chapters (slugs) to chapter ids that have published problems. */
async function resolveScope(tx: SqlTx, body: CreateDiagnosticBody): Promise<{ examId: string; chapterIds: string[] }> {
  const { rows: exams } = await tx.query<{ id: string }>(`select id from public.exams where slug = $1 and is_active`, [body.exam]);
  const examId = exams[0]?.id;
  if (!examId) throw notFound('Exam');
  const p = new Params();
  const w = [`s.exam_id = ${p.add(examId)}`, 'c.is_active'];
  if (body.subjects?.length) w.push(`s.slug = any(${p.add(body.subjects)}::text[])`);
  if (body.chapters?.length) w.push(`c.slug = any(${p.add(body.chapters)}::text[])`);
  const { rows } = await tx.query<{ id: string }>(
    `select c.id from public.chapters c join public.subjects s on s.id = c.subject_id
      where ${w.join(' and ')}
        and exists (select 1 from public.question_families f where f.chapter_id = c.id)
      order by s.sort_order, c.sort_order`,
    p.values,
  );
  if (!rows.length) throw validation('No chapters with problems in this selection', [{ path: 'chapters', message: 'nothing to test' }]);
  return { examId, chapterIds: rows.map((r) => r.id) };
}

const mix = (m: Record<Difficulty, number>) => ({ EASY: m.EASY, MEDIUM: m.MEDIUM, HARD: m.HARD });

function sessionSummary(s: SessionRow) {
  return {
    id: s.id,
    status: s.status,
    attempted_count: s.attempted_count,
    correct_count: s.correct_count,
    total: s.question_ids.length,
    score: normalizeDecimal(s.score),
    mode: s.mode,
    started_at: iso(s.started_at),
    ui_mode: s.ui_mode,
    time_limit_sec: s.time_limit_sec,
  };
}

async function sessionWithQuestions(store: Store, deps: Deps, s: SessionRow) {
  return store.service(async (r) => {
    const rows = await r.content.summaries(s.question_ids);
    const byId = new Map(rows.map((x) => [x.id, x]));
    const ordered = s.question_ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    return { session: sessionSummary(s), questions: await buildPracticeQuestions(r, deps, ordered) };
  });
}

/** Insert a session with server-chosen questions (diagnostic, checkpoint, chapter mistakes). Idempotent on clientRequestId. */
async function insertChosenSession(
  store: Store,
  deps: Deps,
  userId: string,
  s: { clientRequestId: string; mode: 'MIXED' | 'MISTAKES'; examId: string; subjectId?: string | null; chapterId?: string | null; ids: string[]; uiMode: 'learning' | 'test'; timeLimitSec: number | null; filters: Record<string, unknown> },
): Promise<SessionRow> {
  return store.service(async (r) => {
    const existing = await r.practice.findSessionByRequest(userId, s.clientRequestId);
    if (existing) return existing;
    const row = await r.practice.insertSession({
      user_id: userId,
      client_request_id: s.clientRequestId,
      mode: s.mode,
      exam_id: s.examId,
      subject_id: s.subjectId ?? null,
      chapter_id: s.chapterId ?? null,
      topic_id: null,
      paper_id: null,
      filters: s.filters,
      question_ids: s.ids,
      status: 'ACTIVE',
      started_at: deps.clock(),
      ui_mode: s.uiMode,
      time_limit_sec: s.timeLimitSec,
    });
    if (row) return row;
    const again = await r.practice.findSessionByRequest(userId, s.clientRequestId);
    if (!again) throw new ApiError('CONFLICT', 'Could not create session');
    return again;
  });
}

/* ------------------------------------------------------------------------------------------------------------ diagnostic */

export async function createDiagnostic(db: Db, store: Store, deps: Deps, user: AuthUser, plus: boolean, body: CreateDiagnosticBody): Promise<{ created: boolean; data: DiagnosticCreated }> {
  const existing = await store.service((r) => r.practice.findSessionByRequest(user.id, body.client_request_id));
  if (existing) {
    const f = existing.filters as { requested_mix?: Record<Difficulty, number>; actual_mix?: Record<Difficulty, number>; short_by?: number };
    const sq = await sessionWithQuestions(store, deps, existing);
    return { created: false, data: { ...sq, requested_mix: mix(f.requested_mix ?? { EASY: 0, MEDIUM: 0, HARD: 0 }), actual_mix: mix(f.actual_mix ?? { EASY: 0, MEDIUM: 0, HARD: 0 }), short_by: f.short_by ?? 0 } };
  }
  const { examId, chapterIds, cands } = await db.withService(async (tx) => {
    const scope = await resolveScope(tx, body);
    return { ...scope, cands: await candidates(tx, user.id, scope.examId, scope.chapterIds, plus) };
  });
  const d = assembleDiagnostic(cands, { length: body.length, seed: body.client_request_id });
  if (d.picks.length === 0) throw new ApiError('VALIDATION_ERROR', 'No eligible questions for this selection', { status: 422, details: { reason: 'NO_QUESTIONS' } });
  const session = await insertChosenSession(store, deps, user.id, {
    clientRequestId: body.client_request_id,
    mode: 'MIXED',
    examId,
    ids: d.picks.map((p) => p.questionId),
    uiMode: 'test',
    timeLimitSec: Math.max(60, d.picks.length * PLAN_CONFIG.diagnosticSecPerQuestion),
    filters: { diagnostic: true, chapter_ids: chapterIds, requested_mix: d.requestedMix, actual_mix: d.actualMix, short_by: d.shortBy },
  });
  const sq = await sessionWithQuestions(store, deps, session);
  return { created: true, data: { ...sq, requested_mix: mix(d.requestedMix), actual_mix: mix(d.actualMix), short_by: d.shortBy } };
}

interface Loaded {
  session: SessionRow;
  chapterIds: string[];
}

async function loadDiagnostic(store: Store, userId: string, sessionId: string): Promise<Loaded> {
  const s = await store.service((r) => r.practice.getSession(userId, sessionId));
  const f = s?.filters as { diagnostic?: boolean; chapter_ids?: string[] } | undefined;
  if (!s || !f?.diagnostic || !f.chapter_ids?.length) throw notFound('Diagnostic');
  return { session: s, chapterIds: f.chapter_ids };
}

/* -------------------------------------------------------------------------------------------------------------- evidence */

/**
 * Every graded answer in the plan's chapters: the diagnostic's own answers (plus its unanswered questions as skipped once it
 * has ended), earlier history, and answers since the plan started.
 */
async function gatherEvidence(tx: SqlTx, userId: string, diag: SessionRow, chapterIds: string[], planStart: Date | null): Promise<Evidence[]> {
  const { rows } = await tx.query<{ chapter_id: string; difficulty: Difficulty | null; is_correct: boolean; time_spent_ms: number | null; submitted_at: Date; session_id: string | null }>(
    `select a.chapter_id, q.difficulty::text as difficulty, a.is_correct, a.time_spent_ms, a.submitted_at, a.session_id
       from public.attempts a join public.questions q on q.id = a.question_id
      where a.user_id = $1 and a.chapter_id = any($2::uuid[])
      order by a.submitted_at desc
      limit 3000`,
    [userId, chapterIds],
  );
  const out: Evidence[] = rows.map((r) => ({
    chapterId: r.chapter_id,
    difficulty: r.difficulty ?? 'MEDIUM',
    outcome: r.is_correct ? 'correct' : 'wrong',
    timeMs: r.time_spent_ms,
    at: iso(r.submitted_at),
    source: r.session_id === diag.id ? 'diagnostic' : planStart && r.submitted_at >= planStart ? 'plan' : 'history',
  }));
  if (diag.status !== 'ACTIVE') {
    const { rows: unanswered } = await tx.query<{ chapter_id: string; difficulty: Difficulty | null }>(
      `select q.chapter_id, q.difficulty::text as difficulty from public.questions q
        where q.id = any($1::uuid[])
          and not exists (select 1 from public.attempts a where a.session_id = $2 and a.question_id = q.id)`,
      [diag.question_ids, diag.id],
    );
    for (const u of unanswered) out.push({ chapterId: u.chapter_id, difficulty: u.difficulty ?? 'MEDIUM', outcome: 'skipped', timeMs: null, at: iso(diag.completed_at ?? diag.last_activity_at), source: 'diagnostic' });
  }
  return out;
}

async function chapterInfos(tx: SqlTx, userId: string, chapterIds: string[], plus: boolean, evidence: Evidence[]): Promise<ChapterInfo[]> {
  const { rows } = await tx.query<{ chapter_id: string; subject_id: string; difficulty: Difficulty; numbers: number[] }>(
    `select f.chapter_id, f.subject_id, f.difficulty::text as difficulty, array_agg(f.number order by f.number) as numbers
       from public.question_families f
      where f.chapter_id = any($2::uuid[]) and f.difficulty is not null
        and ($3::boolean or f.access_tier = 'FREE')
        and exists (select 1 from public.questions q where q.family_id = f.id and q.publication_status = 'PUBLISHED' and q.answer_key is not null)
        and not exists (select 1 from public.user_family_status u where u.user_id = $1 and u.family_id = f.id and u.solved_at is not null)
      group by f.chapter_id, f.subject_id, f.difficulty`,
    [userId, chapterIds, plus],
  );
  const { rows: mistakes } = await tx.query<{ chapter_id: string; n: string }>(
    `select chapter_id, count(*)::text as n from public.mistakes where user_id = $1 and resolved_at is null and chapter_id = any($2::uuid[]) group by chapter_id`,
    [userId, chapterIds],
  );
  const { rows: subjects } = await tx.query<{ id: string; subject_id: string }>(`select id, subject_id from public.chapters where id = any($1::uuid[])`, [chapterIds]);
  const subjectOf = new Map(subjects.map((s) => [s.id, s.subject_id]));
  const openBy = new Map(mistakes.map((m) => [m.chapter_id, Number(m.n)]));
  return chapterIds.map((id) => {
    const mine = rows.filter((r) => r.chapter_id === id);
    const supply = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const problems: Record<Difficulty, number[]> = { EASY: [], MEDIUM: [], HARD: [] };
    for (const r of mine) {
      supply[r.difficulty] = r.numbers.length;
      problems[r.difficulty] = r.numbers.map(Number);
    }
    const plan = evidence.filter((e) => e.source === 'plan' && e.chapterId === id && e.outcome !== 'skipped');
    return {
      chapterId: id,
      subjectId: subjectOf.get(id) ?? '',
      supply,
      problems,
      openMistakes: openBy.get(id) ?? 0,
      stepAttempts: plan.length,
      stepCorrect: plan.filter((e) => e.outcome === 'correct').length,
    };
  });
}

function chapterResult(e: ChapterEstimate, meta: Map<string, ChapterMeta>): ChapterResult | null {
  const m = meta.get(e.chapterId);
  if (!m) return null;
  return { chapter: { slug: m.slug, name: m.name }, subject: { slug: m.subject_slug, name: m.subject_name }, band: e.band, correct: e.correct, answered: e.answered, slow: e.slow };
}

/* ---------------------------------------------------------------------------------------------------------------- report */

export async function report(db: Db, store: Store, deps: Deps, userId: string, plus: boolean, sessionId: string): Promise<DiagnosticReport> {
  const { session, chapterIds } = await loadDiagnostic(store, userId, sessionId);
  return db.withService(async (tx) => {
    const evidence = await gatherEvidence(tx, userId, session, chapterIds, null);
    const estimates = estimateMastery(chapterIds, evidence, deps.clock());
    const infos = await chapterInfos(tx, userId, chapterIds, plus, evidence);
    const { rows: qs } = await tx.query<{ id: string; chapter_id: string; subject_id: string; difficulty: Difficulty | null }>(
      `select id, chapter_id, subject_id, difficulty::text as difficulty from public.questions where id = any($1::uuid[])`,
      [session.question_ids],
    );
    const picks = qs.map((q) => ({ questionId: q.id, familyId: q.id, chapterId: q.chapter_id, subjectId: q.subject_id, difficulty: q.difficulty ?? ('MEDIUM' as const) }));
    const r = diagnosticReport(picks, evidence, estimates, infos);
    const meta = await chapterMeta(tx, chapterIds);
    const subjectMeta = new Map([...meta.values()].map((m) => [m.subject_id, { slug: m.subject_slug, name: m.subject_name }]));
    const asked = new Set(picks.map((p) => p.chapterId));
    const f = session.filters as { actual_mix?: Record<Difficulty, number> };
    const results = (ids: ChapterEstimate[]) => ids.map((e) => chapterResult(e, meta)).filter((x): x is ChapterResult => !!x);
    return {
      session_id: session.id,
      completed: session.status !== 'ACTIVE',
      actual_mix: mix(f.actual_mix ?? { EASY: 0, MEDIUM: 0, HARD: 0 }),
      subjects: r.subjects
        .map((s) => ({ subject: subjectMeta.get(s.subjectId)!, correct: s.correct, answered: s.answered, skipped: s.skipped }))
        .filter((s) => !!s.subject),
      focus: results(r.focus.map((id) => estimates.find((e) => e.chapterId === id)!)),
      // Free users get the summary and the top 3; the full breakdown is Plus (stripped here, never sent).
      chapters: plus ? results(estimates.filter((e) => e.band !== 'unmeasured' || asked.has(e.chapterId))) : null,
      plus,
    };
  });
}

/* ------------------------------------------------------------------------------------------------------------------ plan */

interface PlanRow {
  id: string;
  user_id: string;
  exam_id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  diagnostic_session_id: string;
  chapter_ids: string[];
  starts_on: string | Date;
  days: number;
  daily_minutes: number;
  seed: string;
  plan_days: PlanDay[];
  item_sessions: Record<string, string>;
  created_at: Date;
}

const ymd = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

async function examSlug(tx: SqlTx, examId: string): Promise<string> {
  const { rows } = await tx.query<{ slug: string }>(`select slug from public.exams where id = $1`, [examId]);
  return rows[0]?.slug ?? 'jee-main';
}

async function toDto(tx: SqlTx, p: PlanRow, todayIndex: number, locked: boolean): Promise<StudyPlan> {
  const meta = await chapterMeta(tx, p.chapter_ids);
  const item = (it: AlgoItem): PlanItem => {
    const m = it.chapterId ? meta.get(it.chapterId) : undefined;
    return {
      key: it.key,
      kind: it.kind,
      chapter: m ? { slug: m.slug, name: m.name } : null,
      subject: m ? { slug: m.subject_slug, name: m.subject_name } : null,
      difficulty: it.difficulty,
      size: it.size,
      problems: it.problems,
      time_limit_sec: it.timeLimitSec,
      minutes: Math.round(it.minutes),
      session_id: p.item_sessions[it.key] ?? null,
      started_at: it.startedAt ?? null,
      completed_at: it.completedAt ?? null,
    };
  };
  return {
    id: p.id,
    exam: await examSlug(tx, p.exam_id),
    status: p.status,
    starts_on: ymd(p.starts_on),
    days: p.days,
    daily_minutes: p.daily_minutes,
    diagnostic_session_id: p.diagnostic_session_id,
    today_index: todayIndex,
    plan_days: p.plan_days.map((d) => ({ index: d.index, date: d.date, light: d.light, items: d.items.map(item) })),
    locked,
    created_at: iso(p.created_at),
  };
}

async function planInput(tx: SqlTx, userId: string, plus: boolean, diag: SessionRow, p: Pick<PlanRow, 'chapter_ids' | 'daily_minutes' | 'days' | 'seed'> & { startsOn: string; createdAt: Date | null }, now: Date) {
  const evidence = await gatherEvidence(tx, userId, diag, p.chapter_ids, p.createdAt);
  return {
    chapters: await chapterInfos(tx, userId, p.chapter_ids, plus, evidence),
    estimates: estimateMastery(p.chapter_ids, evidence, now),
    dailyMinutes: p.daily_minutes,
    days: p.days as 7 | 14,
    startDate: p.startsOn,
    seed: p.seed,
  };
}

export async function createPlan(db: Db, store: Store, deps: Deps, userId: string, body: CreatePlanBody, plus = true): Promise<{ created: boolean; data: StudyPlan }> {
  const { session, chapterIds } = await loadDiagnostic(store, userId, body.diagnostic_session_id);
  if (session.status === 'ACTIVE') throw validation('Submit the diagnostic first', [{ path: 'diagnostic_session_id', message: 'diagnostic still in progress' }]);
  return db.withService(async (tx) => {
    const { rows: dup } = await tx.query<PlanRow>(`select * from public.study_plans where user_id = $1 and client_request_id = $2`, [userId, body.client_request_id]);
    if (dup[0]) return { created: false, data: await toDto(tx, dup[0], 0, false) };
    const now = deps.clock();
    const startsOn = istDate(now);
    const seed = `${session.id}:${body.client_request_id}`;
    // Free (basic) plans only schedule problems a free user can open; Plus plans see the whole bank.
    const input = await planInput(tx, userId, plus, session, { chapter_ids: chapterIds, daily_minutes: body.daily_minutes, days: body.days, seed, startsOn, createdAt: now }, now);
    const days = buildPlan(input);
    await tx.query(`update public.study_plans set status = 'ARCHIVED' where user_id = $1 and exam_id = $2 and status = 'ACTIVE'`, [userId, session.exam_id]);
    const { rows } = await tx.query<PlanRow>(
      `insert into public.study_plans (user_id, exam_id, client_request_id, diagnostic_session_id, chapter_ids, starts_on, days, daily_minutes, seed, plan_days, created_at)
       values ($1, $2, $3, $4, $5::uuid[], $6, $7, $8, $9, $10::jsonb, $11) returning *`,
      [userId, session.exam_id, body.client_request_id, session.id, chapterIds, startsOn, body.days, body.daily_minutes, seed, JSON.stringify(days), now],
    );
    return { created: true, data: await toDto(tx, rows[0]!, 0, false) };
  });
}

async function activePlan(tx: SqlTx, userId: string, exam: string, id?: string): Promise<PlanRow | null> {
  const { rows } = id
    ? await tx.query<PlanRow>(`select * from public.study_plans where user_id = $1 and id = $2`, [userId, id])
    : await tx.query<PlanRow>(
        `select p.* from public.study_plans p join public.exams e on e.id = p.exam_id
          where p.user_id = $1 and e.slug = $2 and p.status = 'ACTIVE'`,
        [userId, exam],
      );
  return rows[0] ?? null;
}

/** Mark items done from their linked sessions / problems. Server-derived only. */
async function refreshCompletion(tx: SqlTx, p: PlanRow, now: Date): Promise<boolean> {
  const sessionIds = Object.values(p.item_sessions);
  const { rows: sessions } = sessionIds.length
    ? await tx.query<{ id: string; status: string; attempted_count: number; n: number; completed_at: Date | null; last_activity_at: Date }>(
        `select id, status::text as status, attempted_count, cardinality(question_ids) as n, completed_at, last_activity_at from public.practice_sessions where id = any($1::uuid[])`,
        [sessionIds],
      )
    : { rows: [] };
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let changed = false;
  for (const day of p.plan_days) {
    for (const it of day.items) {
      if (it.completedAt) continue;
      if (it.kind === 'REVIEW_DIAGNOSTIC' && it.startedAt) {
        it.completedAt = it.startedAt;
        changed = true;
      } else if (it.kind === 'PROBLEMS' && it.startedAt && it.problems?.length) {
        const { rows } = await tx.query<{ n: string }>(
          `select count(*)::text as n from public.question_families f join public.user_family_status u on u.family_id = f.id
            where u.user_id = $1 and f.number = any($2::int[]) and u.last_attempt_at >= $3`,
          [p.user_id, it.problems, it.startedAt],
        );
        if (Number(rows[0]?.n ?? 0) >= it.problems.length) {
          it.completedAt = now.toISOString();
          changed = true;
        }
      } else {
        const s = byId.get(p.item_sessions[it.key] ?? '');
        if (s && (s.status === 'COMPLETED' || s.attempted_count >= s.n)) {
          it.completedAt = iso(s.completed_at ?? s.last_activity_at);
          changed = true;
        }
      }
    }
  }
  return changed;
}

export async function currentPlan(db: Db, deps: Deps, userId: string, plus: boolean, exam: string, freeLimits?: PlanLimits): Promise<StudyPlan> {
  return db.withService(async (tx) => {
    const p = await activePlan(tx, userId, exam);
    if (!p) throw notFound('Plan');
    const now = deps.clock();
    const todayIndex = Math.max(0, Math.min(p.days, daysBetween(ymd(p.starts_on), istDate(now))));
    // Without Plus a basic plan (inside the free limits) keeps working; a bigger plan from a lapsed Plus is read-only.
    if (!plus && !(freeLimits && planWithinLimits(p, freeLimits))) return toDto(tx, p, todayIndex, true);
    await refreshCompletion(tx, p, now);
    if (todayIndex < p.days) {
      // Same transaction (no nested store call: a single-connection pool would deadlock).
      const { rows } = await tx.query<SessionRow>(`select * from public.practice_sessions where id = $1 and user_id = $2`, [p.diagnostic_session_id, userId]);
      const diag = rows[0];
      if (diag) {
        const input = await planInput(tx, userId, plus, diag, { ...p, startsOn: ymd(p.starts_on), createdAt: p.created_at }, now);
        p.plan_days = replan(p.plan_days, input, todayIndex);
      }
    }
    await tx.query(`update public.study_plans set plan_days = $2::jsonb where id = $1`, [p.id, JSON.stringify(p.plan_days)]);
    return toDto(tx, p, todayIndex, false);
  });
}

/**
 * Start an item: create (or reuse) its practice session and remember it. PROBLEMS and REVIEW_DIAGNOSTIC only get a start time
 * (the client opens the problems / the diagnostic results). Idempotent: a started item returns its existing session.
 */
export async function startItem(db: Db, store: Store, deps: Deps, user: AuthUser, planId: string, key: string, access: { plus: boolean; freeLimits: PlanLimits } = { plus: true, freeLimits: { maxDays: 14, maxDailyMinutes: 120 } }): Promise<{ item: PlanItem; session: { session: ReturnType<typeof sessionSummary>; questions: Awaited<ReturnType<typeof buildPracticeQuestions>> } | null }> {
  const loaded = await db.withService(async (tx) => {
    const p = await activePlan(tx, user.id, '', planId);
    if (!p || p.status !== 'ACTIVE') throw notFound('Plan');
    if (!access.plus && !planWithinLimits(p, access.freeLimits)) throw premiumRequired('This plan is longer than the free plan; renew Tabby Plus to continue it');
    const it = p.plan_days.flatMap((d) => d.items).find((x) => x.key === key);
    if (!it) throw notFound('Plan item');
    return { p, it, exam: await examSlug(tx, p.exam_id), meta: await chapterMeta(tx, p.chapter_ids) };
  });
  const { p, it, exam, meta } = loaded;
  const now = deps.clock();
  let session: SessionRow | null = null;
  const existingId = p.item_sessions[key];
  if (existingId) session = await store.service((r) => r.practice.getSession(user.id, existingId));

  if (!session && !['PROBLEMS', 'REVIEW_DIAGNOSTIC', 'READ'].includes(it.kind)) {
    const m = it.chapterId ? meta.get(it.chapterId) : undefined;
    // Stable per item, so a retried start replays the same session instead of creating a second one.
    const requestId = await itemRequestId(p.id, key);
    if ((it.kind === 'PRACTICE' || it.kind === 'TIMED') && m) {
      const base = {
        client_request_id: requestId,
        mode: 'CHAPTER' as const,
        exam,
        subject: m.subject_slug,
        chapter: m.slug,
        size: Math.max(1, Math.min(it.kind === 'TIMED' ? 20 : 50, it.size ?? 8)),
        ui_mode: it.kind === 'TIMED' ? ('test' as const) : ('learning' as const),
        ...(it.kind === 'TIMED' && it.timeLimitSec ? { time_limit_sec: Math.max(60, it.timeLimitSec) } : {}),
      };
      try {
        const r = await createSession(store, deps, user, { ...base, filters: { ...(it.difficulty ? { difficulty: [it.difficulty] } : {}), exclude_correct: true } }, { includePremium: true });
        session = await store.service((x) => x.practice.getSession(user.id, r.data.session.id));
      } catch (e) {
        if (!(e instanceof ApiError) || (e.details as { reason?: string } | undefined)?.reason !== 'NO_QUESTIONS') throw e;
        // Everything at this level solved: practise the chapter again rather than fail the item.
        const r = await createSession(store, deps, user, { ...base, client_request_id: crypto.randomUUID(), filters: { exclude_correct: false } }, { includePremium: true });
        session = await store.service((x) => x.practice.getSession(user.id, r.data.session.id));
      }
    } else if (it.kind === 'MISTAKES' && m) {
      const ids = await db.withService(async (tx) => {
        const { rows } = await tx.query<{ question_id: string }>(
          `select m.question_id from public.mistakes m join public.questions q on q.id = m.question_id and q.publication_status = 'PUBLISHED'
            where m.user_id = $1 and m.chapter_id = $2 and m.resolved_at is null order by m.last_wrong_at desc limit $3`,
          [user.id, m.id, it.size ?? 5],
        );
        return rows.map((r) => r.question_id);
      });
      if (!ids.length) throw new ApiError('VALIDATION_ERROR', 'No open mistakes left in this chapter', { status: 422, details: { reason: 'NO_QUESTIONS' } });
      session = await insertChosenSession(store, deps, user.id, { clientRequestId: requestId, mode: 'MISTAKES', examId: p.exam_id, subjectId: m.subject_id, chapterId: m.id, ids, uiMode: 'learning', timeLimitSec: null, filters: { plan_item: key } });
    } else if (it.kind === 'CHECKPOINT') {
      const cands = await db.withService((tx) => candidates(tx, user.id, p.exam_id, p.chapter_ids, true));
      const d = assembleDiagnostic(cands, { length: it.size ?? PLAN_CONFIG.checkpointSize, seed: `${p.id}:${key}` });
      if (!d.picks.length) throw new ApiError('VALIDATION_ERROR', 'No questions for a checkpoint', { status: 422, details: { reason: 'NO_QUESTIONS' } });
      session = await insertChosenSession(store, deps, user.id, { clientRequestId: requestId, mode: 'MIXED', examId: p.exam_id, ids: d.picks.map((x) => x.questionId), uiMode: 'test', timeLimitSec: it.timeLimitSec ?? null, filters: { plan_item: key, checkpoint: true } });
    }
  }

  const dto = await db.withService(async (tx) => {
    const fresh = await activePlan(tx, user.id, '', planId);
    if (!fresh) throw notFound('Plan');
    for (const d of fresh.plan_days) for (const x of d.items) if (x.key === key && !x.startedAt) x.startedAt = now.toISOString();
    if (session) fresh.item_sessions[key] = session.id;
    await tx.query(`update public.study_plans set plan_days = $2::jsonb, item_sessions = $3::jsonb where id = $1`, [fresh.id, JSON.stringify(fresh.plan_days), JSON.stringify(fresh.item_sessions)]);
    const todayIndex = Math.max(0, Math.min(fresh.days, daysBetween(ymd(fresh.starts_on), istDate(now))));
    return toDto(tx, fresh, todayIndex, false);
  });
  const item = dto.plan_days.flatMap((d) => d.items).find((x) => x.key === key)!;
  return { item, session: session ? await sessionWithQuestions(store, deps, session) : null };
}

/** Deterministic UUID (v4 layout) from plan id + item key: retries of "start" are idempotent through client_request_id. */
async function itemRequestId(planId: string, key: string): Promise<string> {
  const hex = (await sha256Hex(`plan-item:${planId}:${key}`)).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
