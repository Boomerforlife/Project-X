import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminQuestionListItemSchema,
  AdminQuestionSchema,
  AdminQuestionsQuery,
  ApproveBody,
  ApproveSourceBody,
  CreateSolutionBody,
  CreateSourceBody,
  DisputeBody,
  IdParam,
  IngestionDocumentSchema,
  IngestionDocsQuery,
  IngestionJobsQuery,
  JobDetailSchema,
  JobSchema,
  PatchQuestionBody,
  PromoteBody,
  PublishBody,
  QueueQuery,
  RejectBody,
  RejectSourceQuestionBody,
  SolutionIdParam,
  SolutionVersionFullSchema,
  SourceQuestionItemSchema,
  SourceQuestionsQuery,
  SourceSchema,
  TransitionBody,
  VerificationDetailSchema,
  VerificationQueueItemSchema,
  VerificationRunBody,
  PageOnlyQuery,
} from '@projectx/contracts';
import { deps, parseCursor, requireUser, send, sendEmpty, store, valid, type AppEnv, type Ctx } from '../../lib/http';
import * as admin from '../../services/admin';
import { defineRoute, type Guards } from '../define';

type App = OpenAPIHono<AppEnv>;

function actx(c: Ctx): admin.AdminCtx {
  return {
    store: store(c),
    deps: deps(c),
    user: requireUser(c),
    roles: c.get('roles'),
    requestId: c.get('requestId'),
    ipHash: c.get('ipHash'),
  };
}
const body = <S extends z.ZodType>(schema: S) => ({ content: { 'application/json': { schema } }, required: true as const });
const meta = (m: unknown) => (m ? { meta: m as never } : {});

export function registerAdminRoutes(app: App, g: Guards): void {
  const T = ['admin'];
  const rev = { access: 'reviewer', cache: 'PRIVATE', rl: 'RL_ADMIN', tags: T } as const;
  const adm = { access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN', tags: T } as const;

  // ---- questions
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/questions', summary: 'List questions', ...rev, request: { query: AdminQuestionsQuery }, data: z.array(AdminQuestionListItemSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', AdminQuestionsQuery);
      const r = await admin.listQuestions(actx(c), {
        verification: q.verification_status,
        publication: q.publication_status,
        ingestion: q.ingestion_status,
        exam: q.exam,
        subject: q.subject,
        chapter: q.chapter,
        origin: q.origin,
        q: q.q,
        cursor: parseCursor(q.cursor),
        limit: q.limit,
      });
      return send(c, 200, r.data, meta(r.meta));
    },
  );

  app.openapi(
    defineRoute({ method: 'get', path: '/admin/questions/{id}', summary: 'Get a question (any status)', ...rev, request: { params: IdParam }, data: AdminQuestionSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.getQuestion(actx(c), valid(c, 'param', IdParam).id)),
  );

  app.openapi(
    defineRoute({
      method: 'patch', path: '/admin/questions/{id}', summary: 'Edit a question', ...rev,
      description: 'ADMIN: any field. REVIEWER: metadata only (difficulty, chapter, topic, seo_*). Content fields on a PUBLISHED question -> 409 INVALID_STATE_TRANSITION.',
      request: { params: IdParam, body: body(PatchQuestionBody) }, data: AdminQuestionSchema,
    })(g),
    async (c: Ctx) => send(c, 200, await admin.patchQuestion(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', PatchQuestionBody))),
  );

  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/solutions', summary: 'Create a solution version', ...rev, status: 201,
      request: { params: IdParam, body: body(CreateSolutionBody) }, data: SolutionVersionFullSchema,
    })(g),
    async (c: Ctx) => send(c, 201, await admin.createSolution(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', CreateSolutionBody))),
  );

  app.openapi(
    defineRoute({
      method: 'get', path: '/admin/questions/{id}/solutions/{versionId}', summary: 'Get a solution version', ...rev,
      request: { params: SolutionIdParam }, data: SolutionVersionFullSchema,
    })(g),
    async (c: Ctx) => {
      const p = valid(c, 'param', SolutionIdParam);
      return send(c, 200, await admin.getSolution(actx(c), p.id, p.versionId));
    },
  );

  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/approve', summary: 'Approve a solution version', ...rev,
      request: { params: IdParam, body: body(ApproveBody) }, data: AdminQuestionSchema,
    })(g),
    async (c: Ctx) => send(c, 200, await admin.approve(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', ApproveBody))),
  );

  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/reject', summary: 'Reject a solution or the question', ...rev,
      request: { params: IdParam, body: body(RejectBody) }, data: AdminQuestionSchema,
    })(g),
    async (c: Ctx) => send(c, 200, await admin.reject(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', RejectBody))),
  );

  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/publish', summary: 'Publish a question', ...adm,
      description: 'Validates the publish guard (422 PUBLISH_REQUIREMENTS_NOT_MET with details.unmet), copies assets to PUBLIC_ASSETS, purges cache tags.',
      request: { params: IdParam, body: body(PublishBody) }, data: AdminQuestionSchema,
    })(g),
    async (c: Ctx) => send(c, 200, await admin.publish(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', PublishBody))),
  );

  const transitions = [
    ['unpublish', 'Unpublish (PUBLISHED -> DRAFT)', admin.unpublish],
    ['archive', 'Archive', admin.archive],
    ['restore', 'Restore (ARCHIVED -> DRAFT)', admin.restore],
  ] as const;
  for (const [name, summary, fn] of transitions) {
    app.openapi(
      defineRoute({
        method: 'post', path: `/admin/questions/{id}/${name}`, summary, ...adm,
        request: { params: IdParam, body: body(TransitionBody) }, data: AdminQuestionSchema,
      })(g),
      async (c: Ctx) => send(c, 200, await fn(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', TransitionBody))),
    );
  }

  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/dispute', summary: 'Mark a question disputed (auto-unpublishes)', ...rev,
      request: { params: IdParam, body: body(DisputeBody) }, data: AdminQuestionSchema,
    })(g),
    async (c: Ctx) => send(c, 200, await admin.dispute(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', DisputeBody))),
  );

  // ---- verification
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/verification/queue', summary: 'Verification queue', ...rev, request: { query: QueueQuery }, data: z.array(VerificationQueueItemSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', QueueQuery);
      const r = await admin.verificationQueue(actx(c), { status: q.status, exam: q.exam, cursor: parseCursor(q.cursor), limit: q.limit });
      return send(c, 200, r.data, meta(r.meta));
    },
  );
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/questions/{id}/verification', summary: 'Verification runs, AI runs, review history', ...rev, request: { params: IdParam }, data: VerificationDetailSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.verificationDetail(actx(c), valid(c, 'param', IdParam).id)),
  );
  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/questions/{id}/verification/run', summary: 'Enqueue verification/AI jobs', ...rev, status: 202,
      request: { params: IdParam, body: body(VerificationRunBody) }, data: z.object({ job_ids: z.array(z.uuid()), existing_job_ids: z.array(z.uuid()), message: z.string() }),
    })(g),
    async (c: Ctx) => send(c, 202, await admin.runVerification(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', VerificationRunBody))),
  );

  // ---- sources
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/sources', summary: 'List sources', ...adm, request: { query: PageOnlyQuery }, data: z.array(SourceSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', PageOnlyQuery);
      const r = await admin.listSources(actx(c), parseCursor(q.cursor), q.limit);
      return send(c, 200, r.data, meta(r.meta));
    },
  );
  app.openapi(
    defineRoute({ method: 'post', path: '/admin/sources', summary: 'Register a source (unapproved)', ...adm, status: 201, request: { body: body(CreateSourceBody) }, data: SourceSchema })(g),
    async (c: Ctx) => send(c, 201, await admin.createSource(actx(c), valid(c, 'json', CreateSourceBody))),
  );
  app.openapi(
    defineRoute({ method: 'post', path: '/admin/sources/{id}/approve', summary: 'Record licensing approval', ...adm, request: { params: IdParam, body: body(ApproveSourceBody) }, data: SourceSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.approveSource(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', ApproveSourceBody))),
  );

  // ---- ingestion
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/ingestion/documents', summary: 'Source documents', ...adm, request: { query: IngestionDocsQuery }, data: z.array(IngestionDocumentSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', IngestionDocsQuery);
      const r = await admin.listDocuments(actx(c), q.source, parseCursor(q.cursor), q.limit);
      return send(c, 200, r.data, meta(r.meta));
    },
  );
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/ingestion/jobs', summary: 'Pipeline jobs', ...adm, request: { query: IngestionJobsQuery }, data: z.array(JobSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', IngestionJobsQuery);
      const r = await admin.listJobs(actx(c), { status: q.status, kind: q.kind, cursor: parseCursor(q.cursor), limit: q.limit });
      return send(c, 200, r.data, meta(r.meta));
    },
  );
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/ingestion/jobs/{id}', summary: 'Job with events', ...adm, request: { params: IdParam }, data: JobDetailSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.getJob(actx(c), valid(c, 'param', IdParam).id)),
  );
  app.openapi(
    defineRoute({ method: 'post', path: '/admin/ingestion/jobs/{id}/retry', summary: 'Retry a DEAD/CANCELLED job', ...adm, request: { params: IdParam }, data: JobSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.retryJob(actx(c), valid(c, 'param', IdParam).id)),
  );
  app.openapi(
    defineRoute({ method: 'post', path: '/admin/ingestion/jobs/{id}/cancel', summary: 'Cancel a QUEUED/RUNNING job', ...adm, request: { params: IdParam }, data: JobSchema })(g),
    async (c: Ctx) => send(c, 200, await admin.cancelJob(actx(c), valid(c, 'param', IdParam).id)),
  );
  app.openapi(
    defineRoute({ method: 'get', path: '/admin/ingestion/source-questions', summary: 'Extracted source questions', ...adm, request: { query: SourceQuestionsQuery }, data: z.array(SourceQuestionItemSchema) })(g),
    async (c: Ctx) => {
      const q = valid(c, 'query', SourceQuestionsQuery);
      const r = await admin.listSourceQuestions(actx(c), { documentId: q.document_id, status: q.status, cursor: parseCursor(q.cursor), limit: q.limit });
      return send(c, 200, r.data, meta(r.meta));
    },
  );
  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/ingestion/source-questions/{id}/promote', summary: 'Promote to a DRAFT question', ...adm,
      request: { params: IdParam, body: body(PromoteBody) }, data: z.object({ question_id: z.uuid() }),
    })(g),
    async (c: Ctx) => send(c, 200, await admin.promoteSourceQuestion(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', PromoteBody))),
  );
  app.openapi(
    defineRoute({
      method: 'post', path: '/admin/ingestion/source-questions/{id}/reject', summary: 'Reject a source question', ...adm, status: 204,
      request: { params: IdParam, body: body(RejectSourceQuestionBody) }, data: null,
    })(g),
    async (c: Ctx) => {
      await admin.rejectSourceQuestion(actx(c), valid(c, 'param', IdParam).id, valid(c, 'json', RejectSourceQuestionBody).reason);
      return sendEmpty(c);
    },
  );
}
