import {
  type AttemptResult,
  type CreateSessionBody,
  type PracticeQuestion,
  type SessionDetail,
  type SessionListItem,
  type SessionProgress,
  type SessionSummary,
  type SubmitAttemptBody,
} from '@projectx/contracts';
import { cacheTags } from '@projectx/edge';
import { GradingError, canonicalJson, gradeAttempt, normalizeDecimal, sha256Hex } from '@projectx/shared';
import type { AppDeps, AuthUser } from '../deps';
import { ApiError, invalidState, notFound, validation } from '../lib/errors';
import { iso, isoOrNull, paginate } from '../lib/http';
import {
  AssetResolver,
  bundleAssetIds,
  collectAssetIds,
  toPracticeQuestion,
  toPublicSolution,
  withLabels,
} from '../mappers/question';
import { TaxIndex } from '../mappers/taxonomy';
import type {
  AttemptRow,
  OptionRow,
  PageCursor,
  PaperRow,
  QuestionBundle,
  QuestionRow,
  ServiceRepos,
  SessionRow,
  Store,
} from '../repositories/types';
import type { Out } from './catalog';

// ------------------------------------------------------------------ helpers
export function sessionProgress(s: SessionRow): SessionProgress {
  return {
    id: s.id,
    status: s.status,
    attempted_count: s.attempted_count,
    correct_count: s.correct_count,
    total: s.question_ids.length,
    score: normalizeDecimal(s.score),
  };
}
const sessionSummary = (s: SessionRow, paper: PaperRow | null = null): SessionSummary => ({
  ...sessionProgress(s),
  mode: s.mode,
  started_at: iso(s.started_at),
  ui_mode: s.ui_mode,
  time_limit_sec: s.time_limit_sec,
  paper: paper
    ? {
        slug: paper.slug,
        title: paper.title,
        numerical_counted_per_subject: paper.numerical_counted_per_subject ?? null,
        numerical_negative_marks: paper.numerical_negative_marks ?? null,
      }
    : null,
});

/** The paper a PYQ_PAPER session came from (null for every other session). */
async function paperOf(r: ServiceRepos, s: SessionRow): Promise<PaperRow | null> {
  return s.paper_id ? ((await r.content.papersByIds([s.paper_id]))[0] ?? null) : null;
}

/** A full paper is always the whole paper: every published question, in paper order, solved or not. */
export const FULL_PAPER_MAX_QUESTIONS = 200;

/** Build practice DTOs (no answers) for the given questions, preserving `rows` order. */
export async function buildPracticeQuestions(
  r: ServiceRepos,
  deps: Pick<AppDeps, 'config' | 'logger'>,
  rows: QuestionRow[],
  tax?: TaxIndex,
): Promise<PracticeQuestion[]> {
  if (rows.length === 0) return [];
  const taxonomy = tax ?? new TaxIndex(await r.taxonomy.load());
  const options = await r.content.optionsByQuestionIds(rows.map((x) => x.id));
  const byQ = new Map<string, OptionRow[]>();
  for (const o of options) (byQ.get(o.question_id) ?? byQ.set(o.question_id, []).get(o.question_id)!).push(o);
  const ids = new Set<string>();
  for (const q of rows) collectAssetIds(q.structured_content, ids);
  for (const o of options) collectAssetIds(o.content, ids);
  const assets = new AssetResolver(await r.content.assetsByIds([...ids]), deps.config.PUBLIC_ASSETS_BASE_URL, deps.logger);
  const paperIds = [...new Set(rows.map((q) => q.paper_id).filter((x): x is string => !!x))];
  const papers = new Map<string, PaperRow>((await r.content.papersByIds(paperIds)).map((p) => [p.id, p]));
  const out: PracticeQuestion[] = [];
  for (const q of rows) {
    const dto = toPracticeQuestion(q, byQ.get(q.id) ?? [], taxonomy, assets, q.paper_id ? (papers.get(q.paper_id) ?? null) : null);
    if (dto) out.push(dto);
  }
  return out;
}

async function attemptResult(
  r: ServiceRepos,
  deps: Pick<AppDeps, 'config' | 'logger'>,
  attempt: AttemptRow,
  bundle: QuestionBundle,
  session: SessionRow | null,
): Promise<AttemptResult> {
  const key = bundle.question.answer_key;
  if (!key || !bundle.solution) throw notFound('Question');
  const assets = new AssetResolver(await r.content.assetsByIds(bundleAssetIds(bundle)), deps.config.PUBLIC_ASSETS_BASE_URL, deps.logger);
  return {
    attempt_id: attempt.id,
    question_id: attempt.question_id,
    is_correct: attempt.is_correct,
    score: normalizeDecimal(attempt.score),
    correct_answer: withLabels(key, bundle.options),
    solution: toPublicSolution(bundle.solution, bundle.options, assets, deps.logger),
    submitted_at: iso(attempt.submitted_at),
    session: session ? sessionProgress(session) : null,
    response: attempt.response,
    time_spent_ms: attempt.time_spent_ms,
  };
}

// ------------------------------------------------------------------ public practice list
export async function practiceList(
  store: Store,
  deps: Pick<AppDeps, 'config' | 'logger'>,
  q: {
    exam: string;
    subject?: string | undefined;
    chapter?: string | undefined;
    topic?: string | undefined;
    difficulty?: ('EASY' | 'MEDIUM' | 'HARD')[] | undefined;
    type?: ('SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL')[] | undefined;
    year_from?: number | undefined;
    year_to?: number | undefined;
    origin?: 'PYQ' | 'AI_GENERATED' | 'EDITORIAL' | undefined;
    cursor: PageCursor | null;
    limit: number;
  },
): Promise<Out<PracticeQuestion[]>> {
  return store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const exam = tax.examBySlug.get(q.exam);
    if (!exam || !exam.is_active) throw notFound('Exam');
    const subject = q.subject ? tax.subjectBySlug.get(q.subject) : undefined;
    const chapter = q.chapter ? tax.chapterBySlug.get(q.chapter) : undefined;
    const topic = q.topic ? tax.topicBySlug.get(q.topic) : undefined;
    if ((q.subject && !subject) || (q.chapter && !chapter) || (q.topic && !topic)) throw notFound('Taxonomy filter');
    const rows = await r.content.listPractice(
      {
        examId: exam.id,
        subjectId: subject?.id,
        chapterId: chapter?.id,
        topicId: topic?.id,
        difficulty: q.difficulty,
        types: q.type,
        yearFrom: q.year_from,
        yearTo: q.year_to,
        origin: q.origin,
      },
      q.cursor,
      q.limit + 1,
    );
    const page = paginate(rows, q.limit);
    const data = await buildPracticeQuestions(r, deps, page.rows, tax);
    return { data, meta: page.meta, tags: [cacheTags.qlist, cacheTags.exam(exam.id)] };
  });
}

// ------------------------------------------------------------------ sessions
async function sessionQuestions(r: ServiceRepos, deps: Pick<AppDeps, 'config' | 'logger'>, ids: string[]): Promise<PracticeQuestion[]> {
  const rows = await r.content.summaries(ids);
  const byId = new Map(rows.map((x) => [x.id, x]));
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is QuestionRow => !!x);
  return buildPracticeQuestions(r, deps, ordered);
}

export async function createSession(
  store: Store,
  deps: Pick<AppDeps, 'config' | 'logger' | 'clock'>,
  user: AuthUser,
  body: CreateSessionBody,
  opts: { includePremium?: boolean } = {},
): Promise<{ created: boolean; data: { session: SessionSummary; questions: PracticeQuestion[] } }> {
  return store.service(async (r) => {
    const replay = async (s: SessionRow) => ({
      created: false,
      data: { session: sessionSummary(s, await paperOf(r, s)), questions: await sessionQuestions(r, deps, s.question_ids) },
    });
    const existing = await r.practice.findSessionByRequest(user.id, body.client_request_id);
    if (existing) return replay(existing);

    const tax = new TaxIndex(await r.taxonomy.load());
    const exam = tax.examBySlug.get(body.exam);
    if (!exam || !exam.is_active) throw notFound('Exam');
    const need = (cond: unknown, field: string) => {
      if (!cond) throw validation(`mode ${body.mode} requires "${field}"`, [{ path: field, message: 'required for this mode' }]);
    };
    const subject = body.subject ? tax.subjectBySlug.get(body.subject) : undefined;
    const chapter = body.chapter ? tax.chapterBySlug.get(body.chapter) : undefined;
    const topic = body.topic ? tax.topicBySlug.get(body.topic) : undefined;
    const paper = body.paper ? await r.content.paperBySlug(body.paper) : null;
    if ((body.subject && !subject) || (body.chapter && !chapter) || (body.topic && !topic) || (body.paper && !paper)) {
      throw notFound('Taxonomy or paper');
    }
    if (body.mode === 'SUBJECT') need(subject, 'subject');
    if (body.mode === 'CHAPTER') need(chapter, 'chapter');
    if (body.mode === 'TOPIC') need(topic, 'topic');
    if (body.mode === 'PYQ_PAPER') need(paper, 'paper');
    const fullPaper = body.mode === 'PYQ_PAPER';
    const f = fullPaper ? undefined : body.filters;
    const ids = await r.practice.selectQuestionIds({
      mode: body.mode,
      userId: user.id,
      examId: exam.id,
      subjectId: subject?.id,
      chapterId: chapter?.id,
      topicId: topic?.id,
      paperId: paper?.id,
      difficulty: f?.difficulty,
      types: f?.types,
      yearFrom: f?.year_from,
      yearTo: f?.year_to,
      excludeCorrect: fullPaper ? false : (f?.exclude_correct ?? true),
      size: fullPaper ? FULL_PAPER_MAX_QUESTIONS : body.size,
      includePremium: opts.includePremium ?? false,
    });
    if (ids.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'No eligible questions for this selection', { status: 422, details: { reason: 'NO_QUESTIONS' } });
    }
    const inserted = await r.practice.insertSession({
      user_id: user.id,
      client_request_id: body.client_request_id,
      mode: body.mode,
      exam_id: exam.id,
      subject_id: subject?.id ?? null,
      chapter_id: chapter?.id ?? null,
      topic_id: topic?.id ?? null,
      paper_id: paper?.id ?? null,
      filters: (f ?? {}) as Record<string, unknown>,
      question_ids: ids,
      status: 'ACTIVE',
      started_at: deps.clock(),
      ui_mode: body.ui_mode ?? 'learning',
      time_limit_sec: body.time_limit_sec ?? null,
    });
    if (!inserted) {
      const again = await r.practice.findSessionByRequest(user.id, body.client_request_id);
      if (!again) throw new ApiError('CONFLICT', 'Could not create session');
      return replay(again);
    }
    return { created: true, data: { session: sessionSummary(inserted, paper), questions: await sessionQuestions(r, deps, inserted.question_ids) } };
  });
}

export async function getSession(
  store: Store,
  deps: Pick<AppDeps, 'config' | 'logger'>,
  userId: string,
  id: string,
): Promise<SessionDetail> {
  return store.service(async (r) => {
    const s = await r.practice.getSession(userId, id);
    if (!s) throw notFound('Session');
    const attempts = await r.practice.attemptsForSession(userId, id);
    const byQ = new Map(attempts.map((a) => [a.question_id, a]));
    const questions = await sessionQuestions(r, deps, s.question_ids);
    const items: SessionDetail['items'] = [];
    for (const question of questions) {
      const a = byQ.get(question.id);
      let attempt: AttemptResult | null = null;
      if (a) {
        const bundle = await r.content.getPublishedById(question.id);
        if (bundle) attempt = await attemptResult(r, deps, a, bundle, s);
      }
      items.push({ question, attempt });
    }
    return {
      session: { ...sessionSummary(s, await paperOf(r, s)), completed_at: isoOrNull(s.completed_at) },
      items,
    };
  });
}

export async function abandonSession(store: Store, userId: string, id: string): Promise<SessionProgress> {
  return store.service(async (r) => {
    const s = await r.practice.getSession(userId, id);
    if (!s) throw notFound('Session');
    if (s.status !== 'ACTIVE') throw invalidState(s.status, 'abandon');
    const updated = await r.practice.abandonSession(userId, id);
    if (!updated) throw invalidState(s.status, 'abandon');
    return sessionProgress(updated);
  });
}

export async function completeSession(store: Store, userId: string, id: string): Promise<SessionProgress> {
  return store.service(async (r) => {
    const s = await r.practice.getSession(userId, id);
    if (!s) throw notFound('Session');
    if (s.status === 'COMPLETED') return sessionProgress(s);
    if (s.status !== 'ACTIVE') throw invalidState(s.status, 'complete');
    const updated = await r.practice.completeSession(userId, id);
    if (updated) return sessionProgress(updated);
    // lost a race (e.g. the last attempt auto-completed it); re-read
    const again = await r.practice.getSession(userId, id);
    if (again?.status === 'COMPLETED') return sessionProgress(again);
    throw invalidState(again?.status ?? s.status, 'complete');
  });
}

export async function listSessions(
  store: Store,
  userId: string,
  q: { status?: ('ACTIVE' | 'COMPLETED' | 'ABANDONED')[] | undefined; cursor: PageCursor | null; limit: number },
): Promise<Out<SessionListItem[]>> {
  return store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const rows = await r.practice.listSessions(userId, q.status ?? null, q.cursor, q.limit + 1);
    const page = paginate(rows, q.limit);
    const paperIds = [...new Set(page.rows.flatMap((s) => (s.paper_id ? [s.paper_id] : [])))];
    const papers = new Map((paperIds.length ? await r.content.papersByIds(paperIds) : []).map((p) => [p.id, p]));
    const data: SessionListItem[] = [];
    for (const s of page.rows) {
      const exam = tax.exams.get(s.exam_id);
      if (!exam) continue;
      const subject = s.subject_id ? tax.subjects.get(s.subject_id) : undefined;
      const chapter = s.chapter_id ? tax.chapters.get(s.chapter_id) : undefined;
      data.push({
        ...sessionSummary(s, s.paper_id ? (papers.get(s.paper_id) ?? null) : null),
        completed_at: isoOrNull(s.completed_at),
        last_activity_at: iso(s.last_activity_at),
        exam: tax.examRef(exam),
        subject: subject ? tax.subjectRef(subject) : null,
        chapter: chapter ? tax.chapterRef(chapter) : null,
      });
    }
    return { data, meta: page.meta, tags: [] };
  });
}

// ------------------------------------------------------------------ attempts
export async function submitAttempt(
  store: Store,
  deps: Pick<AppDeps, 'config' | 'logger' | 'clock'>,
  user: AuthUser,
  body: SubmitAttemptBody,
  idempotencyKey: string | undefined,
): Promise<{ replayed: boolean; data: AttemptResult }> {
  if (idempotencyKey !== undefined && idempotencyKey !== body.client_attempt_id) {
    throw validation('Idempotency-Key must equal client_attempt_id', [{ path: 'Idempotency-Key', message: 'must equal client_attempt_id' }]);
  }
  // Rule 1
  const requestHash = await sha256Hex(canonicalJson({ question_id: body.question_id, session_id: body.session_id ?? null, response: body.response }));

  return store.service(async (r) => {
    const replayFrom = async (a: AttemptRow) => {
      if (a.request_hash !== requestHash) {
        throw new ApiError('IDEMPOTENCY_CONFLICT', 'client_attempt_id was already used with a different request');
      }
      const bundle = await r.content.getPublishedById(a.question_id);
      if (!bundle) throw notFound('Question');
      const session = a.session_id ? await r.practice.getSession(user.id, a.session_id) : null;
      return { replayed: true, data: await attemptResult(r, deps, a, bundle, session) };
    };

    // Rule 2
    const existing = await r.practice.findAttempt(user.id, body.client_attempt_id);
    if (existing) return replayFrom(existing);

    // Rule 3
    const bundle = await r.content.getPublishedById(body.question_id);
    if (!bundle) throw notFound('Question');
    const q = bundle.question;
    const key = q.answer_key;
    if (!key || !bundle.solution) throw notFound('Question');
    if (body.response.type !== q.question_type) {
      throw validation(`response.type must be ${q.question_type}`, [{ path: 'response.type', message: `must be ${q.question_type}` }]);
    }
    if (body.response.type !== 'NUMERICAL') {
      const optionIds = new Set(bundle.options.map((o) => o.id));
      const given = body.response.type === 'SINGLE_MCQ' ? [body.response.option_id] : body.response.option_ids;
      if (!given.every((id) => optionIds.has(id))) {
        throw validation('Option ids must belong to the question', [{ path: 'response', message: 'unknown option id' }]);
      }
    }

    // Rule 4
    let session: SessionRow | null = null;
    if (body.session_id) {
      session = await r.practice.getSession(user.id, body.session_id);
      if (!session) throw notFound('Session');
      if (session.status !== 'ACTIVE') throw invalidState(session.status, 'attempt');
      if (!session.question_ids.includes(q.id)) throw validation('Question is not part of this session', [{ path: 'question_id', message: 'not in session' }]);
      const prior = await r.practice.findAttemptForSessionQuestion(session.id, q.id);
      if (prior && prior.client_attempt_id !== body.client_attempt_id) {
        throw new ApiError('ALREADY_ATTEMPTED', 'Question already attempted in this session');
      }
    }

    // Rule 5
    let grade;
    try {
      grade = gradeAttempt(key, body.response, { marks: q.marks, negative_marks: q.negative_marks, marking_scheme: q.marking_scheme });
    } catch (e) {
      if (e instanceof GradingError) throw validation(e.message);
      throw e;
    }
    const inserted = await r.practice.insertAttempt({
      user_id: user.id,
      question_id: q.id,
      session_id: body.session_id ?? null,
      client_attempt_id: body.client_attempt_id,
      request_hash: requestHash,
      response: body.response,
      is_correct: grade.is_correct,
      score: grade.score,
      time_spent_ms: body.time_spent_ms ?? null,
      submitted_at: deps.clock(),
    });
    if (!inserted) {
      const again = await r.practice.findAttempt(user.id, body.client_attempt_id);
      if (again) return replayFrom(again);
      throw new ApiError('ALREADY_ATTEMPTED', 'Question already attempted in this session');
    }
    const after = body.session_id ? await r.practice.getSession(user.id, body.session_id) : null;
    // Rule 6: correct answer + solution only after the attempt is stored
    return { replayed: false, data: await attemptResult(r, deps, inserted, bundle, after) };
  });
}
