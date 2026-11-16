import { OpenAPIHono, z } from '@hono/zod-openapi';
import * as billing from '../billing/service';
import { billingDeps } from '../billing/routes';
import { assertQuestionAccessible, stripPremiumSolutionExtras, viewerPlus } from '../problems/access';
import {
  ActivityDaySchema,
  ActivityQuery,
  AttemptHistoryItemSchema,
  AttemptResultSchema,
  AttemptsQuery,
  BookmarkBody,
  BookmarkItemSchema,
  CreateSessionBody,
  DoubtBody,
  DoubtCreatedSchema,
  DoubtItemSchema,
  ExamPreferencesBody,
  IdParam,
  MeSchema,
  MistakeItemSchema,
  MistakesQuery,
  PageOnlyQuery,
  PatchMeBody,
  PracticeListQuery,
  PracticeQuestionSchema,
  ProgressQuery,
  ProgressSchema,
  QuestionIdParam,
  SessionCreatedSchema,
  SessionDetailSchema,
  SessionListItemSchema,
  SessionListQuery,
  SessionProgressSchema,
  StreakSchema,
  SubmitAttemptBody,
  UploadCreatedSchema,
  UuidSchema,
} from '@projectx/contracts';
import { r2Keys, sniffImageMime } from '@projectx/edge';
import { sha256Hex } from '@projectx/shared';
import { ApiError, validation } from '../lib/errors';
import { deps, parseCursor, requireUser, send, sendEmpty, store, valid, type AppEnv, type Ctx } from '../lib/http';
import * as practice from '../services/practice';
import * as student from '../services/student';
import { defineRoute, type Guards } from './define';

type App = OpenAPIHono<AppEnv>;
const MAX_UPLOAD = 5 * 1024 * 1024;

export function registerPractice(app: App, g: Guards): void {
  const list = defineRoute({
    method: 'get', path: '/practice/questions', summary: 'Practice questions (no answers or solutions)', tags: ['practice'], access: 'public', cache: 'PUBLIC_LIST', rl: 'RL_PUBLIC',
    description: 'Published questions only. Never contains answer_key, correct option ids, solution or explanation.',
    request: { query: PracticeListQuery }, data: z.array(PracticeQuestionSchema),
  })(g);
  app.openapi(list, async (c: Ctx) => {
    const q = valid(c, 'query', PracticeListQuery);
    const r = await practice.practiceList(store(c), deps(c), { ...q, cursor: parseCursor(q.cursor) });
    return send(c, 200, r.data, { cache: 'PUBLIC_LIST', tags: r.tags, ...(r.meta ? { meta: r.meta } : {}) });
  });

  const create = defineRoute({
    method: 'post', path: '/practice/sessions', summary: 'Start (or replay) a practice session', tags: ['practice'], access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: CreateSessionBody } }, required: true } },
    status: 201, replay200: true, data: SessionCreatedSchema,
  })(g);
  app.openapi(create, async (c: Ctx) => {
    const body = valid(c, 'json', CreateSessionBody);
    const fullPaper = body.mode === 'PYQ_PAPER';
    // Free plan: monthly full-paper allowance (billing module; no-op while payments are disabled).
    if (fullPaper) await billing.assertFullPaperAllowed(billingDeps(c), requireUser(c).id, body.client_request_id);
    const plus = await viewerPlus(c, requireUser(c).id);
    const r = await practice.createSession(store(c), deps(c), requireUser(c), body, { includePremium: plus });
    if (fullPaper && r.created) await billing.recordFullPaper(billingDeps(c), requireUser(c).id, body.client_request_id);
    return send(c, r.created ? 201 : 200, r.data, r.created ? {} : { meta: { replayed: true } });
  });

  const get = defineRoute({
    method: 'get', path: '/practice/sessions/{id}', summary: 'Session detail (solutions only for attempted items)', tags: ['practice'], access: 'user', cache: 'PRIVATE',
    request: { params: IdParam }, data: SessionDetailSchema,
  })(g);
  app.openapi(get, async (c: Ctx) => {
    const p = valid(c, 'param', IdParam);
    const plus = await viewerPlus(c, requireUser(c).id);
    const s = await practice.getSession(store(c), deps(c), requireUser(c).id, p.id);
    return send(c, 200, plus ? s : { ...s, items: s.items.map((it) => (it.attempt ? { ...it, attempt: stripPremiumSolutionExtras(it.attempt, false) } : it)) });
  });

  const listSessions = defineRoute({
    method: 'get', path: '/practice/sessions', summary: 'List my practice sessions (resume)', tags: ['practice'], access: 'user', cache: 'PRIVATE',
    description: 'Newest activity first. Filter with status=ACTIVE,COMPLETED,ABANDONED (comma separated).',
    request: { query: SessionListQuery }, data: z.array(SessionListItemSchema),
  })(g);
  app.openapi(listSessions, async (c: Ctx) => {
    const q = valid(c, 'query', SessionListQuery);
    const r = await practice.listSessions(store(c), requireUser(c).id, { status: q.status, cursor: parseCursor(q.cursor), limit: q.limit });
    return send(c, 200, r.data, r.meta ? { meta: r.meta } : {});
  });

  const complete = defineRoute({
    method: 'post', path: '/practice/sessions/{id}/complete', summary: 'Complete an active session (idempotent)', tags: ['practice'], access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    description: 'ACTIVE -> COMPLETED. Already COMPLETED returns the same progress; ABANDONED -> 409 INVALID_STATE_TRANSITION.',
    request: { params: IdParam }, data: SessionProgressSchema,
  })(g);
  app.openapi(complete, async (c: Ctx) => {
    const p = valid(c, 'param', IdParam);
    return send(c, 200, await practice.completeSession(store(c), requireUser(c).id, p.id));
  });

  const abandon = defineRoute({
    method: 'post', path: '/practice/sessions/{id}/abandon', summary: 'Abandon an active session', tags: ['practice'], access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { params: IdParam }, data: SessionProgressSchema,
  })(g);
  app.openapi(abandon, async (c: Ctx) => {
    const p = valid(c, 'param', IdParam);
    return send(c, 200, await practice.abandonSession(store(c), requireUser(c).id, p.id));
  });

  const attempt = defineRoute({
    method: 'post', path: '/practice/attempts', summary: 'Submit an attempt (server-side grading, idempotent)', tags: ['practice'], access: 'user', cache: 'PRIVATE', rl: 'RL_ATTEMPTS',
    description: 'Idempotent on client_attempt_id (optional Idempotency-Key header must equal it). Replay with same payload -> 200 meta.replayed; different payload -> 409 IDEMPOTENCY_CONFLICT.',
    request: {
      headers: z.object({ 'idempotency-key': UuidSchema.optional() }),
      body: { content: { 'application/json': { schema: SubmitAttemptBody } }, required: true },
    },
    status: 201, replay200: true, data: AttemptResultSchema,
  })(g);
  app.openapi(attempt, async (c: Ctx) => {
    const body = valid(c, 'json', SubmitAttemptBody);
    const key = c.req.header('Idempotency-Key');
    const plus = await viewerPlus(c, requireUser(c).id);
    await assertQuestionAccessible(c, body.question_id, plus);
    const r = await practice.submitAttempt(store(c), deps(c), requireUser(c), body, key);
    const data = stripPremiumSolutionExtras(r.data, plus);
    return send(c, r.replayed ? 200 : 201, data, r.replayed ? { meta: { replayed: true } } : {});
  });
}

export function registerStudent(app: App, g: Guards): void {
  const base = { access: 'user', cache: 'PRIVATE' } as const;

  const me = defineRoute({ method: 'get', path: '/users/me', summary: 'Current user', tags: ['student'], ...base, data: MeSchema })(g);
  app.openapi(me, async (c: Ctx) => send(c, 200, await student.getMe(store(c), requireUser(c))));

  const patch = defineRoute({
    method: 'patch', path: '/users/me', summary: 'Update profile', tags: ['student'], ...base, rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: PatchMeBody } }, required: true } }, data: MeSchema,
  })(g);
  app.openapi(patch, async (c: Ctx) => send(c, 200, await student.patchMe(store(c), requireUser(c), valid(c, 'json', PatchMeBody))));

  const prefs = defineRoute({
    method: 'put', path: '/users/me/exam-preferences', summary: 'Replace exam preferences', tags: ['student'], ...base, rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: ExamPreferencesBody } }, required: true } }, data: MeSchema,
  })(g);
  app.openapi(prefs, async (c: Ctx) => send(c, 200, await student.putExamPreferences(store(c), requireUser(c), valid(c, 'json', ExamPreferencesBody))));

  const progress = defineRoute({
    method: 'get', path: '/users/me/progress', summary: 'Progress and weak areas', tags: ['student'], ...base,
    request: { query: ProgressQuery }, data: ProgressSchema,
  })(g);
  app.openapi(progress, async (c: Ctx) => send(c, 200, await student.progress(store(c), requireUser(c), valid(c, 'query', ProgressQuery).exam)));

  const streak = defineRoute({ method: 'get', path: '/users/me/streak', summary: 'Streak and daily goal', tags: ['student'], ...base, data: StreakSchema })(g);
  app.openapi(streak, async (c: Ctx) => send(c, 200, await student.streak(store(c), requireUser(c))));

  const activity = defineRoute({
    method: 'get', path: '/users/me/activity', summary: 'Daily activity (heatmap / trends)', tags: ['student'], ...base,
    description: 'Per-day attempts, correct and time spent, ascending. Default: last 120 days; max span 400 days.',
    request: { query: ActivityQuery }, data: z.array(ActivityDaySchema),
  })(g);
  app.openapi(activity, async (c: Ctx) => {
    const q = valid(c, 'query', ActivityQuery);
    return send(c, 200, await student.activity(store(c), requireUser(c), { from: q.from, to: q.to }));
  });

  const attempts = defineRoute({
    method: 'get', path: '/users/me/attempts', summary: 'Attempt history', tags: ['student'], ...base,
    request: { query: AttemptsQuery }, data: z.array(AttemptHistoryItemSchema),
  })(g);
  app.openapi(attempts, async (c: Ctx) => {
    const q = valid(c, 'query', AttemptsQuery);
    const r = await student.listAttempts(store(c), requireUser(c), { questionId: q.question_id, sessionId: q.session_id, cursor: parseCursor(q.cursor), limit: q.limit });
    return send(c, 200, r.data, r.meta ? { meta: r.meta } : {});
  });

  const bms = defineRoute({
    method: 'get', path: '/users/me/bookmarks', summary: 'List bookmarks', tags: ['student'], ...base,
    request: { query: PageOnlyQuery }, data: z.array(BookmarkItemSchema),
  })(g);
  app.openapi(bms, async (c: Ctx) => {
    const q = valid(c, 'query', PageOnlyQuery);
    const r = await student.listBookmarks(store(c), requireUser(c), parseCursor(q.cursor), q.limit);
    return send(c, 200, r.data, r.meta ? { meta: r.meta } : {});
  });

  const addBm = defineRoute({
    method: 'post', path: '/users/me/bookmarks', summary: 'Add or update a bookmark', tags: ['student'], ...base, rl: 'RL_WRITE', status: 201, replay200: true,
    request: { body: { content: { 'application/json': { schema: BookmarkBody } }, required: true } }, data: BookmarkItemSchema,
  })(g);
  app.openapi(addBm, async (c: Ctx) => {
    const b = valid(c, 'json', BookmarkBody);
    const r = await student.addBookmark(store(c), requireUser(c), b.question_id, b.note ?? null);
    return send(c, r.created ? 201 : 200, r.item);
  });

  const delBm = defineRoute({
    method: 'delete', path: '/users/me/bookmarks/{questionId}', summary: 'Remove a bookmark (idempotent)', tags: ['student'], ...base, rl: 'RL_WRITE', status: 204,
    request: { params: QuestionIdParam }, data: null,
  })(g);
  app.openapi(delBm, async (c: Ctx) => {
    await student.removeBookmark(store(c), requireUser(c), valid(c, 'param', QuestionIdParam).questionId);
    return sendEmpty(c);
  });

  const mistakes = defineRoute({
    method: 'get', path: '/users/me/mistakes', summary: 'Mistakes list', tags: ['student'], ...base,
    request: { query: MistakesQuery }, data: z.array(MistakeItemSchema),
  })(g);
  app.openapi(mistakes, async (c: Ctx) => {
    const q = valid(c, 'query', MistakesQuery);
    const r = await student.listMistakes(store(c), requireUser(c), { status: q.status, subject: q.subject, chapter: q.chapter, cursor: parseCursor(q.cursor), limit: q.limit });
    return send(c, 200, r.data, r.meta ? { meta: r.meta } : {});
  });

  const delMistake = defineRoute({
    method: 'delete', path: '/users/me/mistakes/{questionId}', summary: 'Dismiss a mistake', tags: ['student'], ...base, rl: 'RL_WRITE', status: 204,
    request: { params: QuestionIdParam }, data: null,
  })(g);
  app.openapi(delMistake, async (c: Ctx) => {
    await student.dismissMistake(store(c), requireUser(c), valid(c, 'param', QuestionIdParam).questionId);
    return sendEmpty(c);
  });

  const doubts = defineRoute({
    method: 'get', path: '/users/me/doubts', summary: 'My doubts', tags: ['student'], ...base,
    request: { query: PageOnlyQuery }, data: z.array(DoubtItemSchema),
  })(g);
  app.openapi(doubts, async (c: Ctx) => {
    const q = valid(c, 'query', PageOnlyQuery);
    const r = await student.listDoubts(store(c), deps(c), requireUser(c), parseCursor(q.cursor), q.limit);
    return send(c, 200, r.data, r.meta ? { meta: r.meta } : {});
  });

  // ---- doubts & uploads
  const postDoubt = defineRoute({
    method: 'post', path: '/doubts', summary: 'Post a doubt (guest or signed in; never auto-public)', tags: ['doubts'], access: 'optional', cache: 'PRIVATE', rl: 'RL_DOUBTS', status: 202,
    request: { body: { content: { 'application/json': { schema: DoubtBody } }, required: true } }, data: DoubtCreatedSchema,
  })(g);
  app.openapi(postDoubt, async (c: Ctx) => {
    const b = valid(c, 'json', DoubtBody);
    const r = await student.createDoubt(store(c), deps(c), { user: c.get('user'), ipHash: c.get('ipHash') }, b);
    return send(c, 202, r);
  });

  const upload = defineRoute({
    method: 'post', path: '/uploads', summary: 'Upload an image (raw body)', tags: ['doubts'], access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE', status: 201,
    description: 'Raw image body (png/jpeg/webp, <= 5 MiB). Header X-Upload-Purpose: DOUBT_ATTACHMENT. Magic bytes are verified.',
    request: {
      headers: z.object({ 'x-upload-purpose': z.literal('DOUBT_ATTACHMENT') }),
      body: { content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) }, 'image/jpeg': { schema: z.string().openapi({ format: 'binary' }) }, 'image/webp': { schema: z.string().openapi({ format: 'binary' }) } }, required: true },
    },
    data: UploadCreatedSchema,
  })(g);
  app.openapi(upload, async (c: Ctx) => {
    const d = deps(c);
    const user = requireUser(c);
    const ct = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(ct)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Only png, jpeg and webp are accepted');
    if (c.req.header('X-Upload-Purpose') !== 'DOUBT_ATTACHMENT') throw validation('X-Upload-Purpose must be DOUBT_ATTACHMENT', [{ path: 'X-Upload-Purpose', message: 'required' }]);
    const declared = Number(c.req.header('Content-Length') ?? '0');
    if (declared > MAX_UPLOAD) throw new ApiError('PAYLOAD_TOO_LARGE', 'Upload exceeds 5 MiB');
    const reader = c.req.raw.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_UPLOAD) {
          await reader.cancel();
          throw new ApiError('PAYLOAD_TOO_LARGE', 'Upload exceeds 5 MiB');
        }
        chunks.push(value);
      }
    }
    if (total === 0) throw validation('Empty body');
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const ch of chunks) (bytes.set(ch, off), (off += ch.byteLength));
    const sniffed = sniffImageMime(bytes);
    if (!sniffed || sniffed !== ct) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'File content does not match an allowed image type');
    const ext = sniffed === 'image/png' ? 'png' : sniffed === 'image/jpeg' ? 'jpg' : 'webp';
    const id = crypto.randomUUID();
    const now = d.clock();
    const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const sha256 = await sha256Hex(bytes);
    const key = r2Keys.userUpload(user.id, yyyyMm, id, ext);
    await d.storage.USER_UPLOADS.put(key, bytes, { contentType: sniffed });
    const row = await store(c).service((r) =>
      r.students.insertUpload({ id, user_id: user.id, purpose: 'DOUBT_ATTACHMENT', bucket: 'USER_UPLOADS', r2_key: key, mime_type: sniffed, bytes: total, sha256 }),
    ).catch(async (e: unknown) => {
      await d.storage.USER_UPLOADS.delete(key);
      throw e;
    });
    const url = await student.signedUploadUrl(d, key, 'USER_UPLOADS');
    return send(c, 201, { upload_id: row.id, mime_type: row.mime_type, bytes: row.bytes, url });
  });
}

