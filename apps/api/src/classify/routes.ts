import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BulkClassifyBody,
  BulkClassifyResultSchema,
  ClassifyListSchema,
  ClassifyPreviewSchema,
  ClassifyQuery,
  ErrorEnvelopeSchema,
  IdParam,
} from '@projectx/contracts';
import { verifyFileToken } from '@projectx/edge';
import { requireSecret } from '../config';
import { ApiError } from '../lib/errors';
import { deps, requireUser, send, valid, type AppEnv, type Ctx } from '../lib/http';
import { rateLimit } from '../middleware/guards';
import { defineRoute, type Guards } from '../routes/define';
import * as classify from './service';

type App = OpenAPIHono<AppEnv>;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function registerClassify(app: App, g: Guards): void {
  const rev = { access: 'reviewer' as const, cache: 'PRIVATE' as const, rl: 'RL_ADMIN' as const, tags: ['admin', 'classify'] };

  const list = defineRoute({
    method: 'get', path: '/admin/classify/questions', summary: 'Browse questions for classification (any status) with difficulty counts',
    description: 'difficulty accepts EASY, MEDIUM, HARD, UNCLASSIFIED (comma separated). Stable order: exam, year, paper, question number.',
    ...rev, request: { query: ClassifyQuery }, data: ClassifyListSchema,
  })(g);
  app.openapi(list, async (c: Ctx) => send(c, 200, await classify.list(deps(c).db, valid(c, 'query', ClassifyQuery))));

  const bulk = defineRoute({
    method: 'post', path: '/admin/classify/bulk', summary: 'Set difficulty / chapter / topic on up to 200 questions',
    description: 'One transaction. Rows that would break a rule are skipped with a reason; the rest are updated and audit-logged.',
    ...rev, request: { body: { content: { 'application/json': { schema: BulkClassifyBody } }, required: true } }, data: BulkClassifyResultSchema,
  })(g);
  app.openapi(bulk, async (c: Ctx) => {
    const u = requireUser(c);
    const roles = (c.get('roles') ?? []) as string[];
    const d = deps(c);
    return send(c, 200, await classify.bulk(d, { id: u.id, isAdmin: roles.includes('ADMIN'), requestId: c.get('requestId') ?? null }, valid(c, 'json', BulkClassifyBody)));
  });

  const preview = defineRoute({
    method: 'get', path: '/admin/classify/questions/{id}/preview', summary: 'Question with original crops (10-minute signed image URLs) and answer key',
    ...rev, request: { params: IdParam }, data: ClassifyPreviewSchema,
  })(g);
  app.openapi(preview, async (c: Ctx) => send(c, 200, await classify.preview(deps(c), valid(c, 'param', IdParam).id)));

  // Images for the preview. Separate from /files/{token} (which serves user uploads as attachments): this one serves only
  // question images from the two content buckets, inline, and only with a token the preview endpoint signed (10 minutes).
  const img = createRoute({
    method: 'get', path: '/files/preview/{token}', summary: 'Signed question image for the admin preview', tags: ['admin', 'classify'],
    request: { params: z.object({ token: z.string().min(10).max(1500) }) },
    middleware: [rateLimit('RL_ADMIN')],
    responses: {
      200: { description: 'Image bytes', content: { 'image/png': { schema: z.string() } } },
      403: { description: 'Invalid or expired token', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    },
  });
  app.openapi(img, async (c: Ctx) => {
    const d = deps(c);
    const t = await verifyFileToken({ secret: requireSecret(d.config, 'SIGNING_SECRET'), token: c.req.param('token') ?? '', now: d.clock().getTime() });
    if (!t || (t.bucket !== 'SOURCE_DOCS' && t.bucket !== 'PUBLIC_ASSETS')) throw new ApiError('FORBIDDEN', 'Invalid or expired file token');
    const obj = await d.storage[t.bucket].get(t.key);
    if (!obj || !IMAGE_TYPES.has(obj.contentType)) throw new ApiError('FORBIDDEN', 'Invalid or expired file token');
    const res = new Response(obj.body, {
      status: 200,
      headers: { 'Content-Type': obj.contentType, 'Content-Length': String(obj.size), 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' },
    });
    res.headers.set('Cache-Control', 'private, max-age=600');
    return res as never;
  });
}
