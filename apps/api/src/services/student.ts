import type {
  AttemptHistoryItem,
  BookmarkItem,
  DoubtItem,
  ExamPreferencesBody,
  Me,
  MistakeItem,
  PatchMeBody,
  Progress,
  QuestionSummary,
  Streak,
} from '@projectx/contracts';
import { signFileUrl } from '@projectx/edge';
import type { AppDeps, AuthUser } from '../deps';
import { ApiError, notFound, validation } from '../lib/errors';
import { iso, isoOrNull, paginate } from '../lib/http';
import { toQuestionSummary } from '../mappers/question';
import { TaxIndex } from '../mappers/taxonomy';
import type { PageCursor, ProfileRow, QuestionRow, ServiceRepos, Store } from '../repositories/types';
import type { Out } from './catalog';

type D = Pick<AppDeps, 'config' | 'clock'>;

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function buildMe(store: Store, user: AuthUser, profile: ProfileRow, prefs: { exam_id: string; is_primary: boolean; target_year: number | null }[]): Promise<Me> {
  const { tax, roles } = await store.service(async (r) => ({
    tax: new TaxIndex(await r.taxonomy.load()),
    roles: await r.students.rolesFor(user.id),
  }));
  const target = profile.target_exam_id ? tax.exams.get(profile.target_exam_id) : undefined;
  return {
    id: user.id,
    email: user.email,
    display_name: profile.display_name,
    timezone: profile.timezone,
    target_exam: target ? tax.examRef(target) : null,
    target_year: profile.target_year,
    daily_goal_attempts: profile.daily_goal_attempts,
    roles,
    exam_preferences: prefs.flatMap((p) => {
      const e = tax.exams.get(p.exam_id);
      return e ? [{ exam: tax.examRef(e), is_primary: p.is_primary, target_year: p.target_year }] : [];
    }),
    created_at: iso(profile.created_at),
  };
}

export async function getMe(store: Store, user: AuthUser): Promise<Me> {
  const { profile, prefs } = await store.user({ id: user.id, claims: user.claims }, async (u) => ({
    profile: await u.user.getProfile(user.id),
    prefs: await u.user.listPrefs(user.id),
  }));
  if (!profile) throw notFound('Profile');
  return buildMe(store, user, profile, prefs);
}

export async function patchMe(store: Store, user: AuthUser, body: PatchMeBody): Promise<Me> {
  if (body.timezone !== undefined && !validTimezone(body.timezone)) {
    throw validation('Invalid timezone', [{ path: 'timezone', message: 'unknown IANA timezone' }]);
  }
  const patch: Parameters<ServiceUserRepo['updateProfile']>[1] = {};
  if (body.display_name !== undefined) patch.display_name = body.display_name;
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  if (body.target_year !== undefined) patch.target_year = body.target_year;
  if (body.daily_goal_attempts !== undefined) patch.daily_goal_attempts = body.daily_goal_attempts;
  if (body.onboarding_completed) patch.onboarding_completed = true;
  if (body.target_exam !== undefined) {
    if (body.target_exam === null) patch.target_exam_id = null;
    else {
      const tax = new TaxIndex(await store.service((r) => r.taxonomy.load()));
      const e = tax.examBySlug.get(body.target_exam);
      if (!e) throw notFound('Exam');
      patch.target_exam_id = e.id;
    }
  }
  const { profile, prefs } = await store.user({ id: user.id, claims: user.claims }, async (u) => {
    const profile = await u.user.updateProfile(user.id, patch);
    return { profile, prefs: await u.user.listPrefs(user.id) };
  });
  if (!profile) throw notFound('Profile');
  return buildMe(store, user, profile, prefs);
}
type ServiceUserRepo = import('../repositories/types').UserRepo;

export async function putExamPreferences(store: Store, user: AuthUser, body: ExamPreferencesBody): Promise<Me> {
  const tax = new TaxIndex(await store.service((r) => r.taxonomy.load()));
  const rows = body.preferences.map((p) => {
    const e = tax.examBySlug.get(p.exam);
    if (!e) throw notFound(`Exam ${p.exam}`);
    return { exam_id: e.id, is_primary: p.is_primary, target_year: p.target_year ?? null };
  });
  const { profile, prefs } = await store.user({ id: user.id, claims: user.claims }, async (u) => {
    const prefs = await u.user.replacePrefs(user.id, rows);
    return { profile: await u.user.getProfile(user.id), prefs };
  });
  if (!profile) throw notFound('Profile');
  return buildMe(store, user, profile, prefs);
}

export async function progress(store: Store, user: AuthUser, examSlug: string | undefined): Promise<Progress> {
  const tax = new TaxIndex(await store.service((r) => r.taxonomy.load()));
  const ctx = { id: user.id, claims: user.claims };
  const base = await store.user(ctx, async (u) => ({ profile: await u.user.getProfile(user.id), prefs: await u.user.listPrefs(user.id) }));
  let exam = examSlug ? tax.examBySlug.get(examSlug) : undefined;
  if (examSlug && !exam) throw notFound('Exam');
  if (!exam) {
    const primary = base.prefs.find((p) => p.is_primary)?.exam_id;
    const id = base.profile?.target_exam_id ?? primary;
    exam = (id ? tax.exams.get(id) : undefined) ?? tax.raw.exams.filter((e) => e.is_active).sort((a, b) => a.sort_order - b.sort_order)[0];
  }
  if (!exam) throw notFound('Exam');
  const stats = await store.user(ctx, (u) => u.user.chapterStats(user.id, exam.id));
  const acc = (c: number, a: number) => (a > 0 ? c / a : 0);
  const chapters = stats.flatMap((s) => {
    const ch = tax.chapters.get(s.chapter_id);
    return ch
      ? [{ chapter: tax.chapterRef(ch), subject_id: s.subject_id, attempts: s.attempts_count, correct: s.correct_count, accuracy: acc(s.correct_count, s.attempts_count), last_attempt_at: iso(s.last_attempt_at) }]
      : [];
  });
  const bySubject = new Map<string, { attempts: number; correct: number }>();
  for (const s of stats) {
    const cur = bySubject.get(s.subject_id) ?? { attempts: 0, correct: 0 };
    cur.attempts += s.attempts_count;
    cur.correct += s.correct_count;
    bySubject.set(s.subject_id, cur);
  }
  const attempts = stats.reduce((n, s) => n + s.attempts_count, 0);
  const correct = stats.reduce((n, s) => n + s.correct_count, 0);
  return {
    exam: tax.examRef(exam),
    totals: {
      attempts,
      correct,
      accuracy: acc(correct, attempts),
      total_time_ms: stats.reduce((n, s) => n + Number(s.total_time_ms), 0),
      distinct_chapters: stats.length,
    },
    subjects: tax.raw.subjects
      .filter((s) => s.exam_id === exam.id && bySubject.has(s.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => {
        const v = bySubject.get(s.id)!;
        return { subject: tax.subjectRef(s), attempts: v.attempts, correct: v.correct, accuracy: acc(v.correct, v.attempts) };
      }),
    chapters,
    weak_areas: chapters
      .filter((c) => c.attempts >= 5 && c.accuracy < 0.5)
      .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
      .slice(0, 5)
      .map((c) => ({ chapter: c.chapter, attempts: c.attempts, accuracy: c.accuracy, reason: 'LOW_ACCURACY' as const })),
  };
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function streak(store: Store, user: AuthUser): Promise<Streak> {
  const profile = await store.user({ id: user.id, claims: user.claims }, (u) => u.user.getProfile(user.id));
  const { s, days } = await store.service(async (r) => {
    const s = await r.students.getStreak(user.id);
    return { s, days: await r.students.last7Days(user.id, s.today) };
  });
  const byDate = new Map(days.map((d) => [d.activity_date, d]));
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(s.today, i - 6);
    const d = byDate.get(date);
    return { date, attempts: d?.attempts_count ?? 0, correct: d?.correct_count ?? 0 };
  });
  const todayAttempts = last7[6]?.attempts ?? 0;
  const goal = profile?.daily_goal_attempts ?? 10;
  return {
    current_streak: s.current_streak,
    longest_streak: s.longest_streak,
    last_active_date: s.last_active_date,
    today: s.today,
    timezone: s.timezone,
    today_attempts: todayAttempts,
    daily_goal_attempts: goal,
    goal_met_today: todayAttempts >= goal,
    last_7_days: last7,
  };
}

async function summariesFor(r: ServiceRepos, tax: TaxIndex, ids: string[]): Promise<Map<string, QuestionSummary>> {
  const rows: QuestionRow[] = ids.length ? await r.content.summaries(ids) : [];
  const m = new Map<string, QuestionSummary>();
  for (const q of rows) {
    const s = toQuestionSummary(q, tax);
    if (s) m.set(q.id, s);
  }
  return m;
}

export async function listAttempts(
  store: Store,
  user: AuthUser,
  f: { questionId?: string | undefined; sessionId?: string | undefined; cursor: PageCursor | null; limit: number },
): Promise<Out<AttemptHistoryItem[]>> {
  const rows = await store.user({ id: user.id, claims: user.claims }, (u) =>
    u.user.listAttempts(user.id, { questionId: f.questionId, sessionId: f.sessionId }, f.cursor, f.limit + 1),
  );
  const page = paginate(rows, f.limit);
  const sums = await store.service(async (r) => summariesFor(r, new TaxIndex(await r.taxonomy.load()), page.rows.map((a) => a.question_id)));
  const data: AttemptHistoryItem[] = page.rows.flatMap((a) => {
    const question = sums.get(a.question_id);
    return question
      ? [{ id: a.id, question, is_correct: a.is_correct, score: a.score, response: a.response, time_spent_ms: a.time_spent_ms, submitted_at: iso(a.submitted_at) }]
      : [];
  });
  return { data, meta: page.meta, tags: [] };
}

export async function listBookmarks(store: Store, user: AuthUser, cursor: PageCursor | null, limit: number): Promise<Out<BookmarkItem[]>> {
  const rows = await store.user({ id: user.id, claims: user.claims }, (u) => u.user.listBookmarks(user.id, cursor, limit + 1));
  const page = paginate(rows, limit);
  const sums = await store.service(async (r) => summariesFor(r, new TaxIndex(await r.taxonomy.load()), page.rows.map((b) => b.question_id)));
  const data = page.rows.flatMap((b) => {
    const question = sums.get(b.question_id);
    return question ? [{ question, note: b.note, created_at: iso(b.created_at) }] : [];
  });
  return { data, meta: page.meta, tags: [] };
}

export async function addBookmark(store: Store, user: AuthUser, questionId: string, note: string | null): Promise<{ created: boolean; item: BookmarkItem }> {
  const published = await store.service((r) => r.content.summaries([questionId]));
  if (published.length === 0) throw notFound('Question');
  const { created, row } = await store.user({ id: user.id, claims: user.claims }, (u) => u.user.upsertBookmark(user.id, questionId, note));
  const sums = await store.service(async (r) => summariesFor(r, new TaxIndex(await r.taxonomy.load()), [questionId]));
  const question = sums.get(questionId);
  if (!question) throw notFound('Question');
  return { created, item: { question, note: row.note, created_at: iso(row.created_at) } };
}

export async function removeBookmark(store: Store, user: AuthUser, questionId: string): Promise<void> {
  await store.user({ id: user.id, claims: user.claims }, (u) => u.user.deleteBookmark(user.id, questionId));
}

export async function listMistakes(
  store: Store,
  user: AuthUser,
  f: { status: 'open' | 'resolved' | 'all'; subject?: string | undefined; chapter?: string | undefined; cursor: PageCursor | null; limit: number },
): Promise<Out<MistakeItem[]>> {
  const tax = new TaxIndex(await store.service((r) => r.taxonomy.load()));
  const subject = f.subject ? tax.subjectBySlug.get(f.subject) : undefined;
  const chapter = f.chapter ? tax.chapterBySlug.get(f.chapter) : undefined;
  if ((f.subject && !subject) || (f.chapter && !chapter)) throw notFound('Taxonomy filter');
  const rows = await store.user({ id: user.id, claims: user.claims }, (u) =>
    u.user.listMistakes(user.id, { status: f.status, subjectId: subject?.id, chapterId: chapter?.id }, f.cursor, f.limit + 1),
  );
  const page = paginate(rows, f.limit);
  const sums = await store.service((r) => summariesFor(r, tax, page.rows.map((m) => m.question_id)));
  const data = page.rows.flatMap((m) => {
    const question = sums.get(m.question_id);
    return question
      ? [{ question, wrong_count: m.wrong_count, first_wrong_at: iso(m.first_wrong_at), last_wrong_at: iso(m.last_wrong_at), resolved_at: isoOrNull(m.resolved_at) }]
      : [];
  });
  return { data, meta: page.meta, tags: [] };
}

export async function dismissMistake(store: Store, user: AuthUser, questionId: string): Promise<void> {
  await store.user({ id: user.id, claims: user.claims }, (u) => u.user.deleteMistake(user.id, questionId));
}

export async function signedUploadUrl(deps: D, key: string, bucket: 'USER_UPLOADS'): Promise<string> {
  return signFileUrl({
    secret: deps.config.SIGNING_SECRET || 'dev-only-signing-secret',
    baseUrl: deps.config.FILES_BASE_URL,
    bucket,
    key,
    expiresInSec: 900,
    now: deps.clock().getTime(),
  });
}

export async function listDoubts(
  store: Store,
  deps: D,
  user: AuthUser,
  cursor: PageCursor | null,
  limit: number,
): Promise<Out<DoubtItem[]>> {
  const rows = await store.user({ id: user.id, claims: user.claims }, (u) => u.user.listDoubts(user.id, cursor, limit + 1));
  const page = paginate(rows, limit);
  const { sums, uploads } = await store.service(async (r) => ({
    sums: await summariesFor(
      r,
      new TaxIndex(await r.taxonomy.load()),
      page.rows.map((d) => d.question_id).filter((x): x is string => !!x),
    ),
    uploads: new Map(
      (await r.students.uploadsByIds(page.rows.map((d) => d.upload_id).filter((x): x is string => !!x))).map((u) => [u.id, u]),
    ),
  }));
  const data: DoubtItem[] = [];
  for (const d of page.rows) {
    const up = d.upload_id ? uploads.get(d.upload_id) : undefined;
    data.push({
      id: d.id,
      question: d.question_id ? (sums.get(d.question_id) ?? null) : null,
      body: d.body,
      status: d.status,
      created_at: iso(d.created_at),
      attachment_url: up && up.status === 'CONFIRMED' ? await signedUploadUrl(deps, up.r2_key, 'USER_UPLOADS') : null,
    });
  }
  return { data, meta: page.meta, tags: [] };
}

export async function createDoubt(
  store: Store,
  deps: Pick<AppDeps, 'clock'>,
  who: { user: AuthUser | null; ipHash: string },
  body: { body: string; question_id?: string | undefined; upload_id?: string | undefined },
): Promise<{ id: string; status: 'OPEN' }> {
  const account = who.user && !who.user.isAnonymous ? who.user : null;
  if (body.upload_id && !account) throw validation('upload_id requires a signed-in account', [{ path: 'upload_id', message: 'account required' }]);
  return store.service(async (r) => {
    if (body.question_id) {
      const found = await r.content.summaries([body.question_id]);
      if (found.length === 0) throw notFound('Question');
    }
    if (body.upload_id && account) {
      const up = await r.students.getUpload(account.id, body.upload_id);
      if (!up || up.status !== 'CONFIRMED') throw validation('Upload not found', [{ path: 'upload_id', message: 'not a confirmed upload of this user' }]);
    }
    const since = new Date(deps.clock().getTime() - 24 * 3600 * 1000);
    const n = await r.students.countDoubtsSince(account ? { userId: account.id } : { ipHash: who.ipHash }, since);
    if (n >= 20) {
      throw new ApiError('RATE_LIMITED', 'Daily doubt limit reached', { headers: { 'Retry-After': '3600' } });
    }
    const d = await r.students.insertDoubt({
      user_id: account?.id ?? null,
      question_id: body.question_id ?? null,
      body: body.body,
      upload_id: body.upload_id ?? null,
      ip_hash: account ? null : who.ipHash,
    });
    return { id: d.id, status: 'OPEN' as const };
  });
}
