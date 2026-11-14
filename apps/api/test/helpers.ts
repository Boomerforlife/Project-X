import { SignJWT } from 'jose';
import {
  createMemoryRateLimiter,
  createMemoryStorage,
  createRecordingInvalidator,
  type RateLimiter,
  type StorageSet,
} from '@projectx/edge';
import type { Db } from '@projectx/db';
import type { AnswerKey } from '@projectx/contracts';
import { createApp } from '../src/app';
import { parseConfig } from '../src/config';
import { silentLogger, type AppDeps } from '../src/deps';
import { createMemoryStore, MemoryState, computeIndexable } from '../src/repositories/memory/store';
import type { Store, QuestionRow } from '../src/repositories/types';
import { createAuthVerifier } from '../src/auth/verifier';

export const SECRET = 'test-secret-test-secret-test-secret-1234';
export const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function token(sub: string, extra: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ role: 'authenticated', ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  invalidator: ReturnType<typeof createRecordingInvalidator>;
  storage: StorageSet;
  deps: AppDeps;
  req(path: string, init?: RequestInit & { token?: string; json?: unknown }): Promise<Response>;
}

export function makeHarness(opts: { store: Store; db?: Db; rateLimiter?: RateLimiter; clock?: () => Date }): Harness {
  const invalidator = createRecordingInvalidator();
  const storage: StorageSet = { SOURCE_DOCS: createMemoryStorage(), PUBLIC_ASSETS: createMemoryStorage(), USER_UPLOADS: createMemoryStorage() };
  const config = parseConfig({
    APP_ENV: 'test',
    AUTH_MODE: 'test',
    TEST_JWT_SECRET: SECRET,
    SIGNING_SECRET: 'sign-secret-sign-secret-sign-secret-1234',
    IP_HASH_SECRET: 'ip-secret-ip-secret-ip-secret-ip-secret-1234',
    PUBLIC_ASSETS_BASE_URL: 'https://assets.test',
    FILES_BASE_URL: 'https://api.test/api/v1/files',
    ENABLE_API_DOCS: 'true',
    CORS_ALLOWED_ORIGINS: 'https://app.test',
  });
  const deps: AppDeps = {
    config,
    db: opts.db ?? ({} as Db),
    store: opts.store,
    storage,
    cache: invalidator,
    rateLimiter: opts.rateLimiter ?? createMemoryRateLimiter({ RL_PUBLIC: { limit: 100000, periodSec: 60 }, RL_WRITE: { limit: 100000, periodSec: 60 }, RL_ATTEMPTS: { limit: 100000, periodSec: 60 }, RL_ADMIN: { limit: 100000, periodSec: 60 }, RL_SEARCH: { limit: 100000, periodSec: 60 } }),
    auth: createAuthVerifier(config),
    clock: opts.clock ?? (() => new Date()),
    logger: silentLogger,
    waitUntil: (p) => void p,
  };
  const app = createApp(deps);
  return {
    app,
    invalidator,
    storage,
    deps,
    req: async (path, init = {}) => {
      const headers = new Headers(init.headers);
      if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
      let body = init.body;
      if (init.json !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(init.json);
      }
      return app.request(`/api/v1${path}`, { ...init, headers, body });
    },
  };
}

// ---------------------------------------------------------------- memory fixture
export const IDS = {
  exam: id(1), subject: id(2), chapter: id(3), topic: id(4), chapter2: id(5),
  qSingle: id(100), qNum: id(101), qDraft: id(102), qMulti: id(103),
  user: id(900), admin: id(901), reviewer: id(902), user2: id(903),
} as const;
const opt = (q: number, n: number) => id(q * 10 + n);

function q(partial: Partial<QuestionRow> & Pick<QuestionRow, 'id' | 'slug' | 'question_type'>): QuestionRow {
  const now = new Date('2026-01-01T00:00:00Z');
  const base: QuestionRow = {
    exam_id: IDS.exam, subject_id: IDS.subject, chapter_id: IDS.chapter, topic_id: IDS.topic, paper_id: null, origin: 'EDITORIAL',
    marking_scheme: 'STANDARD', difficulty: 'EASY', marks: '4.00', negative_marks: '1.00', year: null, shift: null, session_label: null,
    question_number: null, question_text: `[DEMO] ${partial.slug}`, structured_content: [{ type: 'paragraph', text: `[DEMO] ${partial.slug} $x^2$` }],
    answer_key: null, answer_key_source: null, source_id: null, source_question_id: null, content_hash: null, ingestion_status: 'CHECKED',
    verification_status: 'HUMAN_VERIFIED', publication_status: 'PUBLISHED', indexability: 'AUTO', sitemap_include: false, current_solution_id: null,
    seo_title: null, seo_description: null, is_indexable: false, row_version: 1, created_at: now, updated_at: now, published_at: now, first_published_at: now,
    ...partial,
  };
  base.is_indexable = computeIndexable(base);
  return base;
}

export function seedMemory(): MemoryState {
  const s = new MemoryState(() => new Date('2026-11-14T10:00:00Z'));
  s.taxonomy = {
    exams: [{ id: IDS.exam, code: 'JEE_MAIN', slug: 'jee-main', name: 'JEE Main', short_name: 'JEE Main', description: null, is_active: true, sort_order: 1 }],
    subjects: [{ id: IDS.subject, exam_id: IDS.exam, code: 'PHYSICS', slug: 'jee-main-physics', segment: 'physics', name: 'Physics', is_active: true, sort_order: 1 }],
    chapters: [
      { id: IDS.chapter, subject_id: IDS.subject, slug: 'jee-main-physics-kinematics', segment: 'kinematics', name: 'Kinematics', unit_number: 2, class_level: 11, description: null, is_active: true, sort_order: 1 },
      { id: IDS.chapter2, subject_id: IDS.subject, slug: 'jee-main-physics-laws-of-motion', segment: 'laws-of-motion', name: 'Laws of Motion', unit_number: 3, class_level: 11, description: null, is_active: true, sort_order: 2 },
    ],
    topics: [{ id: IDS.topic, chapter_id: IDS.chapter, slug: 'jee-main-physics-kinematics-projectile-motion', segment: 'projectile-motion', name: 'Projectile Motion', is_active: true, sort_order: 1 }],
  };
  s.sources.push({ id: id(50), code: 'PROJECTX_EDITORIAL', name: 'ProjectX Editorial', kind: 'EDITORIAL_TEAM', publisher: null, homepage_url: null, license_name: null, license_url: null, reuse_permitted: true, attribution_text: 'Synthetic demo', approved_by: null, approved_at: new Date(), notes: null, created_at: new Date() });

  const addMcq = (qid: string, slug: string, type: 'SINGLE_MCQ' | 'MULTI_MCQ', correct: number[], extra: Partial<QuestionRow> = {}) => {
    const solId = id(Number(qid.slice(-3)) + 5000);
    const key: AnswerKey = { type, correct_option_ids: correct.map((n) => opt(Number(qid.slice(-3)), n)).sort() };
    const published = extra.publication_status !== 'DRAFT';
    s.questions.push(q({ id: qid, slug, question_type: type, answer_key: key, answer_key_source: 'HUMAN', current_solution_id: published ? solId : null, source_id: id(50), ...extra }));
    for (let n = 1; n <= 4; n++) s.options.push({ id: opt(Number(qid.slice(-3)), n), question_id: qid, label: 'ABCD'[n - 1] as 'A', sort_order: n - 1, content: [{ type: 'paragraph', text: `Option ${n}` }], content_text: `Option ${n}`, external_option_id: null });
    s.solutions.push({
      id: solId, question_id: qid, version: 1, final_answer: key, summary: 'Because physics.', steps: [{ index: 1, title: null, blocks: [{ type: 'paragraph', text: 'Step one $a=b$' }] }],
      formulas: [], concepts: [], alternatives: [], shortcuts: [], common_mistakes: [], sympy_checks: [], provenance: 'HUMAN_AUTHORED', ai_run_id: null,
      based_on_version_id: null, author_id: null, edit_note: null, review_status: published ? 'APPROVED' : 'PENDING', reviewed_by: null, reviewed_at: published ? new Date() : null, created_at: new Date(),
    });
  };
  addMcq(IDS.qSingle, 'demo-single', 'SINGLE_MCQ', [2]);
  addMcq(IDS.qMulti, 'demo-multi', 'MULTI_MCQ', [1, 3], { sitemap_include: true });
  s.questions.push(
    q({ id: IDS.qNum, slug: 'demo-numerical', question_type: 'NUMERICAL', answer_key: { type: 'NUMERICAL', accepted_ranges: [{ min: '2.48', max: '2.52' }], display_value: '2.5' }, answer_key_source: 'HUMAN', current_solution_id: id(5101), source_id: id(50) }),
  );
  s.solutions.push({
    id: id(5101), question_id: IDS.qNum, version: 1, final_answer: { type: 'NUMERICAL', accepted_ranges: [{ min: '2.48', max: '2.52' }], display_value: '2.5' }, summary: null,
    steps: [{ index: 1, title: null, blocks: [{ type: 'math', latex: 'x=2.5' }] }], formulas: [], concepts: [], alternatives: [], shortcuts: [], common_mistakes: [], sympy_checks: [],
    provenance: 'HUMAN_AUTHORED', ai_run_id: null, based_on_version_id: null, author_id: null, edit_note: null, review_status: 'APPROVED', reviewed_by: null, reviewed_at: new Date(), created_at: new Date(),
  });
  // a DRAFT with a PENDING solution, verified-pending: ready for approve -> publish workflow
  addMcq(IDS.qDraft, 'demo-draft', 'SINGLE_MCQ', [1], { publication_status: 'DRAFT', verification_status: 'AUTOMATED_CHECKS_PASSED', published_at: null, first_published_at: null, answer_key: null, answer_key_source: null });
  for (const [u, r] of [[IDS.admin, ['ADMIN']], [IDS.reviewer, ['REVIEWER']]] as const) s.roles.set(u, [...r]);
  for (const u of [IDS.user, IDS.user2, IDS.admin, IDS.reviewer]) {
    s.profiles.set(u, { id: u, display_name: null, timezone: 'Asia/Kolkata', target_exam_id: null, target_year: null, daily_goal_attempts: 2, onboarding_completed_at: null, created_at: new Date() });
  }
  return s;
}

export function memoryHarness(opts: { rateLimiter?: RateLimiter; clock?: () => Date } = {}) {
  const state = seedMemory();
  const h = makeHarness({ store: createMemoryStore(state), ...opts });
  return { state, ...h };
}

/** Recursively collect all object keys. */
export function allKeys(v: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) allKeys(x, into);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (into.add(k), allKeys(x, into));
  return into;
}
