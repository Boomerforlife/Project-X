import type { AppRole, JobKind, SourceQuestionStatus, SubjectCode } from '@projectx/contracts';
import { ApiError } from '../../lib/errors';
import type {
  AdminRepo,
  AiRunRow,
  AssetRow,
  AttemptRow,
  BookmarkRow,
  ChapterStatRow,
  ContentRepo,
  ActivityRow,
  DailyActivityRow,
  DoubtRow,
  IngestionDocRow,
  JobEventRow,
  JobRow,
  Keyed,
  MistakeRow,
  OptionRow,
  PageCursor,
  PaperRow,
  PracticeRepo,
  PrefRow,
  ProfileRow,
  QuestionBundle,
  QuestionRow,
  ReviewEventRow,
  ServiceRepos,
  SessionRow,
  SolutionRow,
  SourceQuestionRow,
  SourceRow,
  Store,
  StreakRow,
  StudentServiceRepo,
  Taxonomy,
  TaxonomyRepo,
  UploadRow,
  UserCtx,
  UserRepo,
  UserRepos,
  VerificationCheckRow,
  VerificationRunRow,
} from '../types';

const uuid = (): string => crypto.randomUUID();

export function computeIndexable(q: Pick<QuestionRow, 'publication_status' | 'indexability' | 'verification_status' | 'current_solution_id'>): boolean {
  return (
    q.publication_status === 'PUBLISHED' &&
    q.indexability === 'AUTO' &&
    (q.verification_status === 'OFFICIAL_KEY_MATCHED' || q.verification_status === 'HUMAN_VERIFIED') &&
    q.current_solution_id !== null
  );
}

/** Mutable in-memory database used by route tests and as a fast dev double. */
export class MemoryState {
  taxonomy: Taxonomy = { exams: [], subjects: [], chapters: [], topics: [] };
  questions: QuestionRow[] = [];
  options: OptionRow[] = [];
  assets: AssetRow[] = [];
  solutions: SolutionRow[] = [];
  papers: PaperRow[] = [];
  sources: SourceRow[] = [];
  redirects = new Map<string, string>();
  sessions: SessionRow[] = [];
  attempts: AttemptRow[] = [];
  profiles = new Map<string, ProfileRow>();
  prefs = new Map<string, PrefRow[]>();
  bookmarks: (BookmarkRow & { user_id: string })[] = [];
  mistakes: (MistakeRow & { user_id: string })[] = [];
  daily: (ActivityRow & { user_id: string })[] = [];
  chapterStats: (ChapterStatRow & { user_id: string })[] = [];
  doubts: DoubtRow[] = [];
  uploads: UploadRow[] = [];
  roles = new Map<string, AppRole[]>();
  reviewEvents: ReviewEventRow[] = [];
  audit: { actor_id: string; action: string; entity_type: string; entity_id: string | null; details: unknown; request_id: string | null }[] = [];
  jobs: JobRow[] = [];
  jobPayloads = new Map<string, Record<string, unknown>>();
  jobEvents = new Map<string, JobEventRow[]>();
  runs: { run: VerificationRunRow; checks: VerificationCheckRow[] }[] = [];
  aiRuns: (AiRunRow & { question_id: string })[] = [];
  docs: IngestionDocRow[] = [];
  sourceQuestions: SourceQuestionRow[] = [];
  promotions = new Map<string, string>();
  private eventSeq = 0;

  constructor(public clock: () => Date = () => new Date()) {}
  nextEventId(): number {
    return ++this.eventSeq;
  }
  /** Reset per-user data (keeps content/taxonomy). */
  clearUserData(): void {
    this.sessions = [];
    this.attempts = [];
    this.bookmarks = [];
    this.mistakes = [];
    this.daily = [];
    this.chapterStats = [];
    this.doubts = [];
    this.uploads = [];
  }

  bundle(q: QuestionRow): QuestionBundle {
    return {
      question: q,
      options: this.options.filter((o) => o.question_id === q.id).sort((a, b) => a.sort_order - b.sort_order),
      solution: q.current_solution_id ? (this.solutions.find((s) => s.id === q.current_solution_id) ?? null) : null,
      paper: q.paper_id ? (this.papers.find((p) => p.id === q.paper_id) ?? null) : null,
      source: q.source_id ? (this.sources.find((s) => s.id === q.source_id) ?? null) : null,
    };
  }
  /** Public visibility = PUBLISHED and taxonomy active. */
  published(): QuestionRow[] {
    return this.questions.filter((q) => q.publication_status === 'PUBLISHED');
  }
}

// ------------------------------------------------------------------ keyset paging
type Key = (string | number)[];
function cmpKey(a: Key, b: Key): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
export function keyset<T>(rows: T[], keyOf: (r: T) => Key, idOf: (r: T) => string, dir: 'asc' | 'desc', after: PageCursor | null, limit: number): Keyed<T>[] {
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => sign * (cmpKey(keyOf(a), keyOf(b)) || (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0)));
  const filtered = after
    ? sorted.filter((r) => sign * (cmpKey(keyOf(r), after.k as Key) || (idOf(r) < after.id ? -1 : idOf(r) > after.id ? 1 : 0)) > 0)
    : sorted;
  return filtered.slice(0, limit).map((r) => ({ ...r, _k: keyOf(r), _id: idOf(r) }) as Keyed<T>);
}
const iso = (d: Date): string => d.toISOString();

// ------------------------------------------------------------------ repos
function taxonomyRepo(s: MemoryState): TaxonomyRepo {
  return {
    load: async () => structuredClone(s.taxonomy),
    publishedCounts: async () => {
      const m = new Map<string, { chapter_id: string; topic_id: string | null; n: number }>();
      for (const q of s.published()) {
        if (!q.chapter_id) continue;
        const k = `${q.chapter_id}|${q.topic_id ?? ''}`;
        const cur = m.get(k) ?? { chapter_id: q.chapter_id, topic_id: q.topic_id, n: 0 };
        cur.n += 1;
        m.set(k, cur);
      }
      return [...m.values()];
    },
  };
}

function contentRepo(s: MemoryState): ContentRepo {
  const pub = (slug: string) => s.published().find((q) => q.slug === slug);
  const optionsOf = (ids: string[]) => s.options.filter((o) => ids.includes(o.question_id));
  return {
    getPublishedBySlug: async (slug) => {
      const q = pub(slug);
      return q ? s.bundle(q) : null;
    },
    getPublishedById: async (id) => {
      const q = s.published().find((x) => x.id === id);
      return q ? s.bundle(q) : null;
    },
    findRedirectTarget: async (old) => {
      const id = s.redirects.get(old);
      const q = id ? s.published().find((x) => x.id === id) : undefined;
      return q?.slug ?? null;
    },
    listRelated: async (q, limit) => {
      const cands = s.published().filter((x) => x.id !== q.id && x.chapter_id === q.chapter_id && x.chapter_id !== null);
      const score = (x: QuestionRow) => (q.topic_id && x.topic_id === q.topic_id ? 1 : 0);
      return cands
        .sort((a, b) => score(b) - score(a) || Number(b.is_indexable) - Number(a.is_indexable) || (b.published_at?.getTime() ?? 0) - (a.published_at?.getTime() ?? 0))
        .slice(0, limit);
    },
    countRelated: async (q) => s.published().filter((x) => x.id !== q.id && x.chapter_id === q.chapter_id && x.chapter_id !== null).length,
    listForChapter: async (f) => {
      const rows = s
        .published()
        .filter(
          (q) =>
            q.chapter_id === f.chapterId &&
            (!f.topicId || q.topic_id === f.topicId) &&
            (!f.difficulty || q.difficulty === f.difficulty) &&
            (!f.type || q.question_type === f.type) &&
            (!f.year || q.year === f.year),
        );
      return keyset(rows, (q) => [iso(q.published_at ?? q.updated_at)], (q) => q.id, 'desc', f.after, f.limit);
    },
    search: async (f) => {
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const rows = s
        .published()
        .filter((q) => (!f.examId || q.exam_id === f.examId) && (!f.subjectId || q.subject_id === f.subjectId) && (!f.chapterId || q.chapter_id === f.chapterId))
        .map((q) => {
          const hay = `${q.seo_title ?? ''} ${q.question_text}`.toLowerCase();
          const hits = words.filter((w) => hay.includes(w)).length;
          return { ...q, rank: hits / Math.max(1, words.length), _hits: hits };
        })
        .filter((q) => q._hits === words.length);
      return keyset(rows, (q) => [q.rank], (q) => q.id, 'desc', f.after, f.limit) as never;
    },
    sitemap: async (after, limit) => {
      const rows = s.questions.filter((q) => q.is_indexable && q.sitemap_include);
      return keyset(rows, (q) => [iso(q.updated_at)], (q) => q.id, 'asc', after, limit).map((q) => Object.assign(q, { slug: q.slug, exam_id: q.exam_id, updated_at: q.updated_at })) as never;
    },
    listPractice: async (f, after, limit) => {
      const taxOk = (q: QuestionRow) => {
        const sub = q.subject_id ? s.taxonomy.subjects.find((x) => x.id === q.subject_id) : undefined;
        return !!sub && !!q.chapter_id;
      };
      const rows = s.published().filter(
        (q) =>
          q.exam_id === f.examId &&
          taxOk(q) &&
          q.answer_key !== null &&
          (!f.subjectId || q.subject_id === f.subjectId) &&
          (!f.chapterId || q.chapter_id === f.chapterId) &&
          (!f.topicId || q.topic_id === f.topicId) &&
          (!f.difficulty || (q.difficulty !== null && f.difficulty.includes(q.difficulty))) &&
          (!f.types || f.types.includes(q.question_type)) &&
          (!f.yearFrom || (q.year ?? 0) >= f.yearFrom) &&
          (!f.yearTo || (q.year ?? 9999) <= f.yearTo) &&
          (!f.origin || q.origin === f.origin),
      );
      return keyset(rows, (q) => [iso(q.published_at ?? q.updated_at)], (q) => q.id, 'desc', after, limit);
    },
    optionsByQuestionIds: async (ids) => optionsOf(ids),
    summaries: async (ids) => s.published().filter((q) => ids.includes(q.id)),
    assetsByIds: async (ids) => s.assets.filter((a) => ids.includes(a.id)),
    papersByIds: async (ids) => s.papers.filter((p) => ids.includes(p.id)),
    paperBySlug: async (slug) => s.papers.find((p) => p.slug === slug) ?? null,
  };
}

function tzDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function practiceRepo(s: MemoryState): PracticeRepo {
  return {
    selectQuestionIds: async (c) => {
      let pool = s.published().filter((q) => q.exam_id === c.examId && q.chapter_id && q.subject_id && q.answer_key);
      if (c.mode === 'SUBJECT' && c.subjectId) pool = pool.filter((q) => q.subject_id === c.subjectId);
      if (c.mode === 'CHAPTER' && c.chapterId) pool = pool.filter((q) => q.chapter_id === c.chapterId);
      if (c.mode === 'TOPIC' && c.topicId) pool = pool.filter((q) => q.topic_id === c.topicId);
      if (c.mode === 'PYQ_PAPER' && c.paperId) pool = pool.filter((q) => q.paper_id === c.paperId);
      if (c.mode === 'MISTAKES') {
        const open = new Set(s.mistakes.filter((m) => m.user_id === c.userId && m.resolved_at === null).map((m) => m.question_id));
        pool = pool.filter((q) => open.has(q.id));
      }
      if (c.mode === 'BOOKMARKS') {
        const bm = new Set(s.bookmarks.filter((m) => m.user_id === c.userId).map((m) => m.question_id));
        pool = pool.filter((q) => bm.has(q.id));
      }
      if (c.difficulty) pool = pool.filter((q) => q.difficulty !== null && c.difficulty!.includes(q.difficulty));
      if (c.types) pool = pool.filter((q) => c.types!.includes(q.question_type));
      if (c.yearFrom) pool = pool.filter((q) => (q.year ?? 0) >= c.yearFrom!);
      if (c.yearTo) pool = pool.filter((q) => (q.year ?? 9999) <= c.yearTo!);
      if (c.excludeCorrect) {
        const done = new Set(s.attempts.filter((a) => a.user_id === c.userId && a.is_correct).map((a) => a.question_id));
        pool = pool.filter((q) => !done.has(q.id));
      }
      if (c.mode === 'PYQ_PAPER') {
        pool.sort((a, b) => Number(a.question_number?.replace(/\D/g, '') || 0) - Number(b.question_number?.replace(/\D/g, '') || 0));
      } else {
        pool = [...pool].sort(() => Math.random() - 0.5);
      }
      return pool.slice(0, c.size).map((q) => q.id);
    },
    findSessionByRequest: async (u, rid) => s.sessions.find((x) => x.user_id === u && x.client_request_id === rid) ?? null,
    getSession: async (u, id) => s.sessions.find((x) => x.user_id === u && x.id === id) ?? null,
    insertSession: async (row) => {
      if (s.sessions.some((x) => x.user_id === row.user_id && x.client_request_id === row.client_request_id)) return null;
      const now = s.clock();
      const sess: SessionRow = { ...row, id: uuid(), attempted_count: 0, correct_count: 0, score: '0.00', completed_at: null, last_activity_at: now, started_at: now };
      s.sessions.push(sess);
      return sess;
    },
    abandonSession: async (u, id) => {
      const x = s.sessions.find((y) => y.user_id === u && y.id === id && y.status === 'ACTIVE');
      if (!x) return null;
      x.status = 'ABANDONED';
      return x;
    },
    completeSession: async (u, id) => {
      const x = s.sessions.find((y) => y.user_id === u && y.id === id && y.status === 'ACTIVE');
      if (!x) return null;
      x.status = 'COMPLETED';
      x.completed_at = s.clock();
      x.last_activity_at = x.completed_at;
      return x;
    },
    listSessions: async (u, statuses, after, limit) =>
      keyset(
        s.sessions.filter((x) => x.user_id === u && (!statuses || statuses.includes(x.status))),
        (x) => [iso(x.last_activity_at)],
        (x) => x.id,
        'desc',
        after,
        limit,
      ),
    attemptsForSession: async (u, sid) => s.attempts.filter((a) => a.user_id === u && a.session_id === sid),
    findAttempt: async (u, cid) => s.attempts.find((a) => a.user_id === u && a.client_attempt_id === cid) ?? null,
    findAttemptForSessionQuestion: async (sid, qid) => s.attempts.find((a) => a.session_id === sid && a.question_id === qid) ?? null,
    insertAttempt: async (a) => {
      if (s.attempts.some((x) => x.user_id === a.user_id && x.client_attempt_id === a.client_attempt_id)) return null;
      if (a.session_id && s.attempts.some((x) => x.session_id === a.session_id && x.question_id === a.question_id)) return null;
      const q = s.questions.find((x) => x.id === a.question_id);
      if (!q?.subject_id || !q.chapter_id) throw new ApiError('NOT_FOUND', 'Question not found');
      const tz = s.profiles.get(a.user_id)?.timezone ?? 'Asia/Kolkata';
      const row: AttemptRow = { ...a, id: uuid(), activity_date: tzDate(a.submitted_at, tz) };
      s.attempts.push(row);
      // daily activity
      let d = s.daily.find((x) => x.user_id === a.user_id && x.activity_date === row.activity_date);
      if (!d) {
        d = { user_id: a.user_id, activity_date: row.activity_date, attempts_count: 0, correct_count: 0, total_time_ms: 0 };
        s.daily.push(d);
      }
      d.attempts_count += 1;
      d.correct_count += a.is_correct ? 1 : 0;
      d.total_time_ms += a.time_spent_ms ?? 0;
      // mistakes
      const now = a.submitted_at;
      const m = s.mistakes.find((x) => x.user_id === a.user_id && x.question_id === a.question_id);
      if (!a.is_correct) {
        if (m) Object.assign(m, { wrong_count: m.wrong_count + 1, last_wrong_at: now, resolved_at: null });
        else s.mistakes.push({ user_id: a.user_id, question_id: a.question_id, subject_id: q.subject_id, chapter_id: q.chapter_id, wrong_count: 1, first_wrong_at: now, last_wrong_at: now, resolved_at: null });
      } else if (m && m.resolved_at === null) m.resolved_at = now;
      // chapter stats
      let cs = s.chapterStats.find((x) => x.user_id === a.user_id && x.chapter_id === q.chapter_id);
      if (!cs) {
        cs = { user_id: a.user_id, chapter_id: q.chapter_id, subject_id: q.subject_id, exam_id: q.exam_id, attempts_count: 0, correct_count: 0, total_time_ms: 0, last_attempt_at: now };
        s.chapterStats.push(cs);
      }
      cs.attempts_count += 1;
      cs.correct_count += a.is_correct ? 1 : 0;
      cs.total_time_ms += a.time_spent_ms ?? 0;
      cs.last_attempt_at = now;
      // session
      if (a.session_id) {
        const sess = s.sessions.find((x) => x.id === a.session_id);
        if (sess) {
          sess.attempted_count += 1;
          sess.correct_count += a.is_correct ? 1 : 0;
          sess.score = (Number(sess.score) + Number(a.score)).toFixed(2);
          sess.last_activity_at = now;
          if (sess.attempted_count >= sess.question_ids.length) Object.assign(sess, { status: 'COMPLETED', completed_at: now });
        }
      }
      return row;
    },
  };
}

function studentServiceRepo(s: MemoryState): StudentServiceRepo {
  return {
    getStreak: async (userId): Promise<StreakRow> => {
      const tz = s.profiles.get(userId)?.timezone ?? 'Asia/Kolkata';
      const today = tzDate(s.clock(), tz);
      const dates = s.daily.filter((d) => d.user_id === userId).map((d) => d.activity_date).sort();
      let longest = 0;
      let run = 0;
      let prev: string | null = null;
      for (const d of dates) {
        run = prev && addDays(prev, 1) === d ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = d;
      }
      const last = dates[dates.length - 1] ?? null;
      const current = last && last >= addDays(today, -1) ? run : 0;
      return { current_streak: current, longest_streak: longest, last_active_date: last, today, timezone: tz };
    },
    last7Days: async (userId, today) =>
      s.daily.filter((d) => d.user_id === userId && d.activity_date >= addDays(today, -6) && d.activity_date <= today),
    rolesFor: async (u) => s.roles.get(u) ?? [],
    countDoubtsSince: async (who, since) =>
      s.doubts.filter((d) => d.created_at >= since && ('userId' in who ? d.user_id === who.userId : d.ip_hash === who.ipHash)).length,
    insertDoubt: async (d) => {
      const row: DoubtRow = { id: uuid(), ...d, status: 'OPEN', is_public: false, created_at: s.clock() };
      s.doubts.push(row);
      return row;
    },
    insertUpload: async (u) => {
      const row: UploadRow = { ...u, status: 'CONFIRMED', created_at: s.clock() };
      s.uploads.push(row);
      return row;
    },
    getUpload: async (userId, id) => s.uploads.find((u) => u.id === id && u.user_id === userId) ?? null,
    uploadsByIds: async (ids) => s.uploads.filter((u) => ids.includes(u.id)),
    getProfile: async (id) => s.profiles.get(id) ?? null,
  };
}

function userRepo(s: MemoryState): UserRepo {
  return {
    getProfile: async (id) => s.profiles.get(id) ?? null,
    updateProfile: async (id, patch) => {
      const p = s.profiles.get(id);
      if (!p) return null;
      const { onboarding_completed, ...rest } = patch;
      Object.assign(p, rest);
      if (onboarding_completed) p.onboarding_completed_at = s.clock();
      return p;
    },
    listPrefs: async (id) => [...(s.prefs.get(id) ?? [])],
    replacePrefs: async (id, prefs) => {
      s.prefs.set(id, [...prefs]);
      return prefs;
    },
    listBookmarks: async (id, after, limit) =>
      keyset(s.bookmarks.filter((b) => b.user_id === id), (b) => [iso(b.created_at)], (b) => b.question_id, 'desc', after, limit),
    upsertBookmark: async (id, qid, note) => {
      const ex = s.bookmarks.find((b) => b.user_id === id && b.question_id === qid);
      if (ex) {
        ex.note = note;
        return { created: false, row: ex };
      }
      const row = { user_id: id, question_id: qid, note, created_at: s.clock() };
      s.bookmarks.push(row);
      return { created: true, row };
    },
    deleteBookmark: async (id, qid) => {
      s.bookmarks = s.bookmarks.filter((b) => !(b.user_id === id && b.question_id === qid));
    },
    listMistakes: async (id, f, after, limit) =>
      keyset(
        s.mistakes.filter(
          (m) =>
            m.user_id === id &&
            (f.status === 'all' || (f.status === 'open' ? m.resolved_at === null : m.resolved_at !== null)) &&
            (!f.subjectId || m.subject_id === f.subjectId) &&
            (!f.chapterId || m.chapter_id === f.chapterId),
        ),
        (m) => [iso(m.last_wrong_at)],
        (m) => m.question_id,
        'desc',
        after,
        limit,
      ),
    deleteMistake: async (id, qid) => {
      s.mistakes = s.mistakes.filter((m) => !(m.user_id === id && m.question_id === qid));
    },
    chapterStats: async (id, examId) => s.chapterStats.filter((c) => c.user_id === id && c.exam_id === examId),
    listAttempts: async (id, f, after, limit) =>
      keyset(
        s.attempts.filter((a) => a.user_id === id && (!f.questionId || a.question_id === f.questionId) && (!f.sessionId || a.session_id === f.sessionId)),
        (a) => [iso(a.submitted_at)],
        (a) => a.id,
        'desc',
        after,
        limit,
      ),
    listActivity: async (id, from, to) =>
      s.daily
        .filter((d) => d.user_id === id && d.activity_date >= from && d.activity_date <= to)
        .sort((a, b) => (a.activity_date < b.activity_date ? -1 : 1))
        .map((d) => ({ activity_date: d.activity_date, attempts_count: d.attempts_count, correct_count: d.correct_count, total_time_ms: d.total_time_ms })),
    listDoubts: async (id, after, limit) =>
      keyset(s.doubts.filter((d) => d.user_id === id), (d) => [iso(d.created_at)], (d) => d.id, 'desc', after, limit),
  };
}

function adminRepo(s: MemoryState): AdminRepo {
  const sourceById = (id: string) => s.sources.find((x) => x.id === id) ?? null;
  return {
    listQuestions: async (f, after, limit) => {
      const rows = s.questions.filter(
        (q) =>
          (!f.verification || f.verification.includes(q.verification_status)) &&
          (!f.publication || f.publication.includes(q.publication_status)) &&
          (!f.ingestion || f.ingestion.includes(q.ingestion_status)) &&
          (!f.examId || q.exam_id === f.examId) &&
          (!f.subjectId || q.subject_id === f.subjectId) &&
          (!f.chapterId || q.chapter_id === f.chapterId) &&
          (!f.origin || q.origin === f.origin) &&
          (!f.q || `${q.question_text} ${q.slug}`.toLowerCase().includes(f.q.toLowerCase())),
      );
      return keyset(rows, (q) => [iso(q.updated_at)], (q) => q.id, 'desc', after, limit);
    },
    getQuestion: async (id) => { const q = s.questions.find((x) => x.id === id); return q ? { ...q } : null; },
    optionsFor: async (id) => s.options.filter((o) => o.question_id === id).sort((a, b) => a.sort_order - b.sort_order),
    solutionVersions: async (id) => s.solutions.filter((x) => x.question_id === id).sort((a, b) => b.version - a.version),
    getSolution: async (id) => s.solutions.find((x) => x.id === id) ?? null,
    getSource: async (id) => sourceById(id),
    sourceByIdMap: async (ids) => s.sources.filter((x) => ids.includes(x.id)),
    paperById: async (id) => s.papers.find((p) => p.id === id) ?? null,
    updateQuestion: async (id, expected, patch, opts) => {
      const q = s.questions.find((x) => x.id === id);
      if (!q) return null;
      if (q.row_version !== expected) return 'CONFLICT';
      if (patch.slug && patch.slug !== q.slug) {
        if (q.first_published_at && !opts?.allowSlugChange) throw Object.assign(new Error('SLUG_LOCKED'), { code: 'P0001' });
        if (s.questions.some((x) => x.slug === patch.slug)) throw Object.assign(new Error('duplicate slug'), { code: '23505' });
        s.redirects.set(q.slug, q.id);
        s.redirects.delete(patch.slug);
      }
      const prevPub = q.publication_status;
      Object.assign(q, patch);
      q.row_version += 1;
      q.updated_at = s.clock();
      if (q.verification_status === 'DISPUTED' && q.publication_status === 'PUBLISHED') q.publication_status = 'DRAFT';
      if (prevPub !== 'PUBLISHED' && q.publication_status === 'PUBLISHED') {
        q.published_at = s.clock();
        q.first_published_at ??= q.published_at;
      }
      if (prevPub === 'PUBLISHED' && q.publication_status !== 'PUBLISHED') q.published_at = null;
      q.is_indexable = computeIndexable(q);
      return { ...q };
    },
    upsertOptionsByLabel: async (qid, opts) => {
      const keep = new Set(opts.map((o) => o.label));
      s.options = s.options.filter((o) => o.question_id !== qid || keep.has(o.label));
      for (const o of opts) {
        const ex = s.options.find((x) => x.question_id === qid && x.label === o.label);
        if (ex) Object.assign(ex, { sort_order: o.sort_order, content: o.content, content_text: o.content_text });
        else s.options.push({ id: uuid(), question_id: qid, label: o.label, sort_order: o.sort_order, content: o.content, content_text: o.content_text, external_option_id: null });
      }
      return s.options.filter((o) => o.question_id === qid);
    },
    insertSolution: async (n) => {
      const version = Math.max(0, ...s.solutions.filter((x) => x.question_id === n.question_id).map((x) => x.version)) + 1;
      const row: SolutionRow = { ...n, id: uuid(), version, sympy_checks: [], ai_run_id: null, review_status: 'PENDING', reviewed_by: null, reviewed_at: null, created_at: s.clock() };
      s.solutions.push(row);
      return row;
    },
    setSolutionReview: async (id, status, reviewer) => {
      const x = s.solutions.find((y) => y.id === id);
      if (x) Object.assign(x, { review_status: status, reviewed_by: reviewer, reviewed_at: s.clock() });
    },
    supersedeApproved: async (qid, except) => {
      for (const x of s.solutions) if (x.question_id === qid && x.id !== except && x.review_status === 'APPROVED') x.review_status = 'SUPERSEDED';
    },
    assetsForQuestion: async (qid) => s.assets.filter((a) => a.question_id === qid),
    moveAssetToPublic: async (id, key) => {
      const a = s.assets.find((x) => x.id === id);
      if (a) Object.assign(a, { bucket: 'PUBLIC_ASSETS', r2_key: key });
    },
    insertReviewEvent: async (e) => {
      s.reviewEvents.push({ ...e, id: s.nextEventId(), created_at: s.clock() });
    },
    insertAudit: async (a) => {
      s.audit.push({ actor_id: a.actor_id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, details: a.details, request_id: a.request_id });
    },
    enqueueJob: async (j) => {
      const ex = s.jobs.find((x) => x.idempotency_key === j.idempotency_key);
      if (ex) return ex.id;
      const row: JobRow = {
        id: uuid(), kind: j.kind as JobKind, idempotency_key: j.idempotency_key, status: 'QUEUED', priority: j.priority ?? 100, attempts: 0, max_attempts: 5,
        run_after: s.clock(), locked_by: null, last_error: null, question_id: j.question_id ?? null, source_document_id: j.source_document_id ?? null, created_at: s.clock(), finished_at: null,
      };
      s.jobs.push(row);
      s.jobPayloads.set(row.id, j.payload);
      return row.id;
    },
    verificationRuns: async (qid) => s.runs.filter((r) => r.run.question_id === qid),
    latestRuns: async (ids) => {
      const m = new Map<string, VerificationRunRow>();
      for (const { run } of s.runs) if (ids.includes(run.question_id)) {
        const cur = m.get(run.question_id);
        if (!cur || cur.started_at < run.started_at) m.set(run.question_id, run);
      }
      return m;
    },
    aiRuns: async (qid) => s.aiRuns.filter((r) => r.question_id === qid),
    reviewEvents: async (qid) => s.reviewEvents.filter((e) => e.question_id === qid).sort((a, b) => b.id - a.id),
    listSources: async (after, limit) => keyset(s.sources, (x) => [x.code], (x) => x.id, 'asc', after, limit),
    insertSource: async (n) => {
      if (s.sources.some((x) => x.code === n.code)) throw Object.assign(new Error('dup'), { code: '23505' });
      const row: SourceRow = { ...n, id: uuid(), approved_by: null, approved_at: null, created_at: s.clock() };
      s.sources.push(row);
      return row;
    },
    approveSource: async (id, approver, license, note) => {
      const x = sourceById(id);
      if (!x) return null;
      Object.assign(x, { reuse_permitted: true, license_name: license.name, license_url: license.url, approved_by: approver, approved_at: s.clock(), notes: note });
      return x;
    },
    listDocuments: async (source, after, limit) =>
      keyset(s.docs.filter((d) => !source || d.source_code === source), (d) => [iso(d.created_at)], (d) => d.id, 'desc', after, limit),
    listJobs: async (f, after, limit) =>
      keyset(s.jobs.filter((j) => (!f.status || f.status.includes(j.status)) && (!f.kind || f.kind.includes(j.kind))), (j) => [iso(j.created_at)], (j) => j.id, 'desc', after, limit),
    getJob: async (id) => s.jobs.find((j) => j.id === id) ?? null,
    findJobByKey: async (k) => s.jobs.find((j) => j.idempotency_key === k) ?? null,
    jobEvents: async (id) => s.jobEvents.get(id) ?? [],
    retryJob: async (id) => {
      const j = s.jobs.find((x) => x.id === id && (x.status === 'DEAD' || x.status === 'CANCELLED'));
      if (!j) return null;
      Object.assign(j, { status: 'QUEUED', attempts: 0, run_after: s.clock(), finished_at: null });
      return j;
    },
    cancelJob: async (id) => {
      const j = s.jobs.find((x) => x.id === id && (x.status === 'QUEUED' || x.status === 'RUNNING'));
      if (!j) return null;
      Object.assign(j, { status: 'CANCELLED', finished_at: s.clock() });
      return j;
    },
    listSourceQuestions: async (f, after, limit) =>
      keyset(s.sourceQuestions.filter((x) => !f.status || x.status === (f.status as SourceQuestionStatus)), (x) => [x.question_number.padStart(6, '0')], (x) => x.id, 'asc', after, limit),
    getSourceQuestion: async (id) => s.sourceQuestions.find((x) => x.id === id) ?? null,
    promoteSourceQuestion: async (id, _examId, _subject: SubjectCode | null) => {
      const ex = s.promotions.get(id);
      if (ex) return ex;
      const qid = uuid();
      s.promotions.set(id, qid);
      const sq = s.sourceQuestions.find((x) => x.id === id);
      if (sq) Object.assign(sq, { status: 'PROMOTED', promoted_question_id: qid });
      return qid;
    },
    rejectSourceQuestion: async (id) => {
      const sq = s.sourceQuestions.find((x) => x.id === id);
      if (sq) sq.status = 'REJECTED';
    },
  };
}

export function memoryRepos(s: MemoryState): ServiceRepos {
  return { taxonomy: taxonomyRepo(s), content: contentRepo(s), practice: practiceRepo(s), students: studentServiceRepo(s), admin: adminRepo(s) };
}

export function createMemoryStore(state: MemoryState): Store {
  return {
    service: (fn) => fn(memoryRepos(state)),
    user: (_ctx: UserCtx, fn: (r: UserRepos) => Promise<never>) => fn({ user: userRepo(state) }),
    ping: async () => true,
  } as Store;
}
