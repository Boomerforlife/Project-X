import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  ChapterQuery,
  PublicChapterSchema,
  PublicExamSchema,
  PublicQuestionSchema,
  PublicSubjectSchema,
  QuestionSummarySchema,
  RelatedQuery,
  SearchQuery,
  SearchResultSchema,
  SitemapEntrySchema,
  SitemapQuery,
  SlugSchema,
  TaxonomyChapterSchema,
  TaxonomyExamSchema,
  TaxonomySubjectSchema,
  TaxonomyTopicSchema,
  TaxonomyTreeQuery,
  TaxonomyTreeSchema,
  ErrorEnvelopeSchema,
} from '@projectx/contracts';
import { applyCacheHeaders, verifyFileToken } from '@projectx/edge';
import { swaggerUI } from '@hono/swagger-ui';
import { requireSecret } from '../config';
import { rateLimit } from '../middleware/guards';
import { ApiError } from '../lib/errors';
import { deps, parseCursor, send, store, valid, type AppEnv, type Ctx } from '../lib/http';
import * as catalog from '../services/catalog';
import { defineRoute, type Guards } from './define';

type App = OpenAPIHono<AppEnv>;

const slugParam = (name: string) => z.object({ [name]: SlugSchema });

// ------------------------------------------------------------------ system
export function registerSystem(app: App, g: Guards, getDoc: () => unknown): void {
  const health = defineRoute({
    method: 'get',
    path: '/health',
    summary: 'Health check',
    tags: ['system'],
    access: 'public',
    cache: 'NONE',
    data: z.object({ status: z.literal('ok'), version: z.string(), db: z.enum(['ok', 'degraded']) }),
  })(g);
  app.openapi(health, async (c: Ctx) => {
    const d = deps(c);
    let db: 'ok' | 'degraded' = 'degraded';
    try {
      const ok = await Promise.race([store(c).ping(), new Promise<boolean>((res) => setTimeout(() => res(false), 500))]);
      db = ok ? 'ok' : 'degraded';
    } catch {
      db = 'degraded';
    }
    return send(c, 200, { status: 'ok', version: d.config.API_VERSION, db }, { cache: 'NONE' });
  });

  const openapiRoute = createRoute({
    method: 'get',
    path: '/openapi.json',
    summary: 'OpenAPI 3.1 document',
    tags: ['system'],
    responses: { 200: { description: 'OpenAPI document (raw, no envelope)', content: { 'application/json': { schema: z.looseObject({}) } } } },
  });
  app.openapi(openapiRoute, (c: Ctx) => {
    const res = c.json(getDoc() as Record<string, unknown>, 200);
    const prod = deps(c).config.APP_ENV === 'production' || deps(c).config.APP_ENV === 'staging';
    applyCacheHeaders(res.headers, prod ? 'TAXONOMY' : 'NONE', prod ? ['tax'] : undefined);
    return res as never;
  });

  if (true) {
    const docsRoute = createRoute({
      method: 'get',
      path: '/docs',
      summary: 'Swagger UI (only when ENABLE_API_DOCS)',
      tags: ['system'],
      responses: { 200: { description: 'HTML', content: { 'text/html': { schema: z.string() } } }, 404: { description: 'Disabled', content: { 'application/json': { schema: ErrorEnvelopeSchema } } } },
    });
    const ui = swaggerUI({ url: '/api/v1/openapi.json' });
    app.openapi(docsRoute, async (c: Ctx, next) => {
      if (!deps(c).config.ENABLE_API_DOCS) throw new ApiError('NOT_FOUND', 'Not found');
      const res = await ui(c as never, next);
      if (res instanceof Response) applyCacheHeaders(res.headers, 'NONE');
      return res as never;
    });
  }
}

// ------------------------------------------------------------------ taxonomy + public content
export function registerPublic(app: App, g: Guards): void {
  const exams = defineRoute({
    method: 'get', path: '/taxonomy/exams', summary: 'List active exams', tags: ['taxonomy'], access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC',
    data: z.array(TaxonomyExamSchema),
  })(g);
  app.openapi(exams, async (c: Ctx) => {
    const r = await catalog.listExams(store(c));
    return send(c, 200, r.data, { cache: 'TAXONOMY', tags: r.tags });
  });

  const subjectsP = z.object({ examSlug: SlugSchema });
  const subjects = defineRoute({
    method: 'get', path: '/taxonomy/exams/{examSlug}/subjects', summary: 'Subjects of an exam', tags: ['taxonomy'], access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC',
    request: { params: subjectsP }, data: z.array(TaxonomySubjectSchema),
  })(g);
  app.openapi(subjects, async (c: Ctx) => {
    const p = valid(c, 'param', subjectsP);
    const r = await catalog.listSubjects(store(c), p.examSlug);
    return send(c, 200, r.data, { cache: 'TAXONOMY', tags: r.tags });
  });

  const chaptersP = z.object({ subjectSlug: SlugSchema });
  const chapters = defineRoute({
    method: 'get', path: '/taxonomy/subjects/{subjectSlug}/chapters', summary: 'Chapters of a subject', tags: ['taxonomy'], access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC',
    request: { params: chaptersP }, data: z.array(TaxonomyChapterSchema),
  })(g);
  app.openapi(chapters, async (c: Ctx) => {
    const p = valid(c, 'param', chaptersP);
    const r = await catalog.listChapters(store(c), p.subjectSlug);
    return send(c, 200, r.data, { cache: 'TAXONOMY', tags: r.tags });
  });

  const topicsP = z.object({ chapterSlug: SlugSchema });
  const topics = defineRoute({
    method: 'get', path: '/taxonomy/chapters/{chapterSlug}/topics', summary: 'Topics of a chapter', tags: ['taxonomy'], access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC',
    request: { params: topicsP }, data: z.array(TaxonomyTopicSchema),
  })(g);
  app.openapi(topics, async (c: Ctx) => {
    const p = valid(c, 'param', topicsP);
    const r = await catalog.listTopics(store(c), p.chapterSlug);
    return send(c, 200, r.data, { cache: 'TAXONOMY', tags: r.tags });
  });

  const tree = defineRoute({
    method: 'get', path: '/taxonomy/tree', summary: 'Full taxonomy tree of an exam', tags: ['taxonomy'], access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC',
    request: { query: TaxonomyTreeQuery }, data: TaxonomyTreeSchema,
  })(g);
  app.openapi(tree, async (c: Ctx) => {
    const q = valid(c, 'query', TaxonomyTreeQuery);
    const r = await catalog.taxonomyTree(store(c), q.exam);
    return send(c, 200, r.data, { cache: 'TAXONOMY', tags: r.tags });
  });

  // ---- public content
  const qP = z.object({ slug: SlugSchema });
  const question = defineRoute({
    method: 'get', path: '/public/questions/{slug}', summary: 'Published question with solution', tags: ['public'], access: 'public', cache: 'PUBLIC_CONTENT', rl: 'RL_PUBLIC',
    description: 'Only PUBLISHED questions. An old slug returns 301 MOVED_PERMANENTLY (Location = new API path). ETag + If-None-Match supported.',
    request: { params: qP }, data: PublicQuestionSchema,
  })(g);
  app.openapi(question, async (c: Ctx) => {
    const p = valid(c, 'param', qP);
    const r = await catalog.publicQuestion(store(c), deps(c), p.slug);
    const inm = c.req.header('If-None-Match');
    if (inm && inm.split(',').map((s) => s.trim()).includes(r.etag)) {
      const res = c.body(null, 304);
      applyCacheHeaders(res.headers, 'PUBLIC_CONTENT', r.tags);
      res.headers.set('ETag', r.etag);
      return res as never;
    }
    return send(c, 200, r.data, { cache: 'PUBLIC_CONTENT', tags: r.tags, headers: { ETag: r.etag } });
  });

  const related = defineRoute({
    method: 'get', path: '/public/questions/{slug}/related', summary: 'Related published questions', tags: ['public'], access: 'public', cache: 'PUBLIC_CONTENT', rl: 'RL_PUBLIC',
    request: { params: qP, query: RelatedQuery }, data: z.array(QuestionSummarySchema),
  })(g);
  app.openapi(related, async (c: Ctx) => {
    const p = valid(c, 'param', qP);
    const q = valid(c, 'query', RelatedQuery);
    const r = await catalog.relatedQuestions(store(c), p.slug, q.limit);
    return send(c, 200, r.data, { cache: 'PUBLIC_CONTENT', tags: r.tags });
  });

  const exam = defineRoute({
    method: 'get', path: '/public/exams/{slug}', summary: 'Exam landing data', tags: ['public'], access: 'public', cache: 'PUBLIC_CONTENT', rl: 'RL_PUBLIC',
    request: { params: qP }, data: PublicExamSchema,
  })(g);
  app.openapi(exam, async (c: Ctx) => {
    const r = await catalog.publicExam(store(c), valid(c, 'param', qP).slug);
    return send(c, 200, r.data, { cache: 'PUBLIC_CONTENT', tags: r.tags });
  });

  const subject = defineRoute({
    method: 'get', path: '/public/subjects/{slug}', summary: 'Subject landing data', tags: ['public'], access: 'public', cache: 'PUBLIC_CONTENT', rl: 'RL_PUBLIC',
    request: { params: qP }, data: PublicSubjectSchema,
  })(g);
  app.openapi(subject, async (c: Ctx) => {
    const r = await catalog.publicSubject(store(c), valid(c, 'param', qP).slug);
    return send(c, 200, r.data, { cache: 'PUBLIC_CONTENT', tags: r.tags });
  });

  const chapter = defineRoute({
    method: 'get', path: '/public/chapters/{slug}', summary: 'Chapter page with paginated question summaries', tags: ['public'], access: 'public', cache: 'PUBLIC_CONTENT', rl: 'RL_PUBLIC',
    request: { params: qP, query: ChapterQuery }, data: PublicChapterSchema,
  })(g);
  app.openapi(chapter, async (c: Ctx) => {
    const p = valid(c, 'param', qP);
    const q = valid(c, 'query', ChapterQuery);
    const r = await catalog.publicChapter(store(c), p.slug, {
      difficulty: q.difficulty,
      type: q.type,
      topic: q.topic,
      year: q.year,
      cursor: parseCursor(q.cursor),
      limit: q.limit,
    });
    return send(c, 200, r.data, { cache: 'PUBLIC_CONTENT', tags: r.tags, ...(r.meta ? { meta: r.meta } : {}) });
  });

  const search = defineRoute({
    method: 'get', path: '/public/search', summary: 'Full-text search over published questions', tags: ['public'], access: 'public', cache: 'PUBLIC_LIST', rl: 'RL_SEARCH',
    request: { query: SearchQuery }, data: z.array(SearchResultSchema),
  })(g);
  app.openapi(search, async (c: Ctx) => {
    const q = valid(c, 'query', SearchQuery);
    const r = await catalog.searchQuestions(store(c), { ...q, cursor: parseCursor(q.cursor) });
    return send(c, 200, r.data, { cache: 'PUBLIC_LIST', tags: r.tags, ...(r.meta ? { meta: r.meta } : {}) });
  });

  const sitemap = defineRoute({
    method: 'get', path: '/public/sitemap/questions', summary: 'Indexable, sitemap-opted-in question paths', tags: ['public'], access: 'public', cache: 'PUBLIC_LIST', rl: 'RL_PUBLIC',
    request: { query: SitemapQuery }, data: z.array(SitemapEntrySchema),
  })(g);
  app.openapi(sitemap, async (c: Ctx) => {
    const q = valid(c, 'query', SitemapQuery);
    const r = await catalog.sitemapQuestions(store(c), parseCursor(q.cursor), q.limit);
    return send(c, 200, r.data, { cache: 'PUBLIC_LIST', tags: r.tags, ...(r.meta ? { meta: r.meta } : {}) });
  });

  // ---- signed private files
  const filesRoute = createRoute({
    method: 'get',
    path: '/files/{token}',
    summary: 'Stream a private object via signed token',
    tags: ['public'],
    request: { params: z.object({ token: z.string().min(10).max(1500) }) },
    middleware: [rateLimit('RL_PUBLIC')],
    responses: {
      200: { description: 'Object bytes', content: { 'application/octet-stream': { schema: z.string() } } },
      403: { description: 'Invalid or expired token', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    },
  });
  app.openapi(filesRoute, async (c: Ctx) => {
    const d = deps(c);
    const token = c.req.param('token') ?? '';
    const secret = requireSecret(d.config, 'SIGNING_SECRET');
    const t = await verifyFileToken({ secret, token, now: d.clock().getTime() });
    if (!t || t.bucket !== 'USER_UPLOADS') throw new ApiError('FORBIDDEN', 'Invalid or expired file token');
    const obj = await d.storage[t.bucket].get(t.key);
    if (!obj) throw new ApiError('FORBIDDEN', 'Invalid or expired file token');
    const res = new Response(obj.body, { status: 200, headers: { 'Content-Type': obj.contentType, 'Content-Length': String(obj.size), 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff' } });
    res.headers.set('Cache-Control', 'private, max-age=300');
    return res as never;
  });
}

