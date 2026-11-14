import type { AiTask, AnswerKey, Db, IngestionStatus, JobKind, OptionLabel, SqlTx } from '../types.js';
import type {
  AiRepository,
  AiRunRecord,
  ClassificationPatch,
  EnqueueJob,
  JobRecord,
  NewAiRun,
  NewSolution,
  NewVerificationRun,
  QuestionAsset,
  QuestionRecord,
  SolutionRecord,
  TaxonomyCandidates,
} from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

/** Walks arbitrary content JSON and collects image block asset ids. */
export function collectAssetIds(content: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(content)) {
    for (const item of content) collectAssetIds(item, into);
  } else if (content && typeof content === 'object') {
    const o = content as Record<string, unknown>;
    if (o.type === 'image' && typeof o.asset_id === 'string') into.add(o.asset_id);
    for (const v of Object.values(o)) if (v && typeof v === 'object') collectAssetIds(v, into);
  }
  return into;
}

interface QuestionRow {
  id: string;
  slug: string;
  exam_id: string;
  exam_name: string;
  subject_id: string | null;
  subject_name: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  topic_id: string | null;
  difficulty: QuestionRecord['difficulty'];
  question_type: QuestionRecord['questionType'];
  question_text: string;
  structured_content: unknown;
  year: number | null;
  answer_key: AnswerKey | null;
  answer_key_source: QuestionRecord['answerKeySource'];
  content_hash: string | null;
  ingestion_status: IngestionStatus;
  verification_status: QuestionRecord['verificationStatus'];
  publication_status: QuestionRecord['publicationStatus'];
  seo_title: string | null;
  seo_description: string | null;
  dropped: boolean;
}

interface SolutionRow {
  id: string;
  question_id: string;
  version: number;
  final_answer: AnswerKey;
  summary: string | null;
  steps: SolutionRecord['steps'];
  formulas: SolutionRecord['formulas'];
  concepts: string[];
  alternatives: SolutionRecord['alternatives'];
  shortcuts: string[];
  common_mistakes: string[];
  sympy_checks: SolutionRecord['sympyChecks'];
  ai_run_id: string | null;
}

function toSolution(r: SolutionRow): SolutionRecord {
  return {
    id: r.id,
    questionId: r.question_id,
    version: r.version,
    finalAnswer: r.final_answer,
    summary: r.summary ?? '',
    steps: r.steps,
    formulas: r.formulas,
    concepts: r.concepts,
    alternatives: r.alternatives,
    shortcuts: r.shortcuts,
    commonMistakes: r.common_mistakes,
    sympyChecks: r.sympy_checks,
    aiRunId: r.ai_run_id,
  };
}

const SOLUTION_COLS = `id, question_id, version, final_answer, summary, steps, formulas, to_jsonb(concepts) as concepts,
  alternatives, shortcuts, common_mistakes, sympy_checks, ai_run_id`;

async function audit(tx: SqlTx, action: string, entityType: string, entityId: string, details: unknown): Promise<void> {
  await tx.query(
    `insert into audit_log(actor_type, action, entity_type, entity_id, details) values ('WORKER', $1, $2, $3::uuid, $4::jsonb)`,
    [action, entityType, entityId, json(details)],
  );
}

/** SQL implementation over a Db (`@projectx/db`); every method is one `withService` transaction (RLS bypassed). */
export function createSqlAiRepository(db: Db): AiRepository {
  return {
    async loadQuestion(id) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<QuestionRow>(
          `select q.id, q.slug, q.exam_id, e.name as exam_name, q.subject_id, s.name as subject_name, q.chapter_id, c.name as chapter_name,
                  q.topic_id, q.difficulty::text as difficulty, q.question_type::text as question_type, q.question_text, q.structured_content,
                  q.year::int as year, q.answer_key, q.answer_key_source::text as answer_key_source, q.content_hash,
                  q.ingestion_status::text as ingestion_status, q.verification_status::text as verification_status,
                  q.publication_status::text as publication_status, q.seo_title, q.seo_description,
                  exists(select 1 from official_answer_keys k where k.question_id = q.id and k.is_dropped) as dropped
             from questions q
             join exams e on e.id = q.exam_id
             left join subjects s on s.id = q.subject_id
             left join chapters c on c.id = q.chapter_id
            where q.id = $1::uuid`,
          [id],
        );
        const r = rows[0];
        if (!r) return null;
        const opts = await tx.query<{ id: string; label: OptionLabel; content_text: string; content: unknown }>(
          `select id, label, content_text, content from question_options where question_id = $1::uuid order by sort_order`,
          [id],
        );
        const assets = await tx.query<{ id: string; bucket: QuestionAsset['bucket']; r2_key: string; mime_type: QuestionAsset['mimeType'] }>(
          `select id, bucket::text as bucket, r2_key, mime_type from question_assets where question_id = $1::uuid`,
          [id],
        );
        const referenced = collectAssetIds(r.structured_content);
        for (const o of opts.rows) collectAssetIds(o.content, referenced);
        const record: QuestionRecord = {
          id: r.id,
          slug: r.slug,
          examId: r.exam_id,
          examName: r.exam_name,
          subjectId: r.subject_id,
          subjectName: r.subject_name,
          chapterId: r.chapter_id,
          chapterName: r.chapter_name,
          topicId: r.topic_id,
          difficulty: r.difficulty,
          questionType: r.question_type,
          questionText: r.question_text,
          structuredContent: r.structured_content,
          options: opts.rows.map((o) => ({ id: o.id, label: o.label, text: o.content_text })),
          referencedAssetIds: [...referenced],
          assets: assets.rows.map((a) => ({ id: a.id, bucket: a.bucket, r2Key: a.r2_key, mimeType: a.mime_type })),
          year: r.year,
          answerKey: r.answer_key,
          answerKeySource: r.answer_key_source,
          officialKeyDropped: r.dropped,
          contentHash: r.content_hash,
          ingestionStatus: r.ingestion_status,
          verificationStatus: r.verification_status,
          publicationStatus: r.publication_status,
          seoTitle: r.seo_title,
          seoDescription: r.seo_description,
        };
        return record;
      });
    },

    async resolveQuestionId(idOrSlug) {
      return db.withService(async (tx) => {
        const { rows } = UUID_RE.test(idOrSlug)
          ? await tx.query<{ id: string }>(`select id from questions where id = $1::uuid`, [idOrSlug])
          : await tx.query<{ id: string }>(`select id from questions where slug = $1`, [idOrSlug]);
        return rows[0]?.id ?? null;
      });
    },

    async loadTaxonomy(examId): Promise<TaxonomyCandidates> {
      return db.withService(async (tx) => {
        const subjects = await tx.query<{ id: string; code: string }>(
          `select id, code from subjects where exam_id = $1::uuid and is_active order by sort_order`,
          [examId],
        );
        const chapters = await tx.query<{ id: string; subject_id: string; subject_code: string; slug: string; name: string }>(
          `select c.id, c.subject_id, s.code as subject_code, c.slug, c.name
             from chapters c join subjects s on s.id = c.subject_id
            where s.exam_id = $1::uuid and s.is_active and c.is_active order by s.sort_order, c.sort_order`,
          [examId],
        );
        const topics = await tx.query<{ id: string; chapter_id: string; chapter_slug: string; slug: string; name: string }>(
          `select t.id, t.chapter_id, c.slug as chapter_slug, t.slug, t.name
             from topics t join chapters c on c.id = t.chapter_id join subjects s on s.id = c.subject_id
            where s.exam_id = $1::uuid and t.is_active and c.is_active and s.is_active order by c.sort_order, t.sort_order`,
          [examId],
        );
        return {
          subjects: subjects.rows,
          chapters: chapters.rows.map((c) => ({ id: c.id, subjectId: c.subject_id, subjectCode: c.subject_code, slug: c.slug, name: c.name })),
          topics: topics.rows.map((t) => ({ id: t.id, chapterId: t.chapter_id, chapterSlug: t.chapter_slug, slug: t.slug, name: t.name })),
        };
      });
    },

    async findSucceededRun(task: AiTask, inputHash: string) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<RunRow>(
          `select id, task::text as task, question_id, input_hash, status::text as status, output, model
             from ai_runs where task = $1::ai_task and input_hash = $2 and status = 'SUCCEEDED'`,
          [task, inputHash],
        );
        return rows[0] ? toRun(rows[0]) : null;
      });
    },

    async findLatestSucceededRun(questionId: string, task: AiTask) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<RunRow>(
          `select id, task::text as task, question_id, input_hash, status::text as status, output, model
             from ai_runs where question_id = $1::uuid and task = $2::ai_task and status = 'SUCCEEDED'
            order by created_at desc, id limit 1`,
          [questionId, task],
        );
        return rows[0] ? toRun(rows[0]) : null;
      });
    },

    async insertAiRun(run: NewAiRun): Promise<AiRunRecord> {
      return db.withService(async (tx) => {
        const params = [
          run.task,
          run.questionId,
          run.solutionVersionId ?? null,
          run.jobId,
          run.provider,
          run.model,
          run.promptId,
          run.promptVersion,
          run.inputHash,
          run.status,
          json(run.output),
          run.error,
          run.inputTokens,
          run.outputTokens,
          run.costUsdMicros,
          run.latencyMs,
        ];
        const ins = await tx.query<RunRow>(
          `insert into ai_runs(task, question_id, solution_version_id, job_id, provider, model, prompt_id, prompt_version, input_hash,
                               status, output, error, input_tokens, output_tokens, cost_usd_micros, latency_ms)
           values ($1::ai_task, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::ai_run_status, $11::jsonb, $12, $13::int, $14::int, $15::bigint, $16::int)
           on conflict (task, input_hash) where status = 'SUCCEEDED' do nothing
           returning id, task::text as task, question_id, input_hash, status::text as status, output, model`,
          params,
        );
        if (ins.rows[0]) return toRun(ins.rows[0]);
        const existing = await tx.query<RunRow>(
          `select id, task::text as task, question_id, input_hash, status::text as status, output, model
             from ai_runs where task = $1::ai_task and input_hash = $2 and status = 'SUCCEEDED'`,
          [run.task, run.inputHash],
        );
        const row = existing.rows[0];
        if (!row) throw new Error('ai_runs insert conflicted but no SUCCEEDED row found');
        return toRun(row);
      });
    },

    async applyClassification(questionId: string, p: ClassificationPatch) {
      await db.withService(async (tx) => {
        const cur = (
          await tx.query<{ subject_id: string | null; chapter_id: string | null; topic_id: string | null; difficulty: string | null; ingestion_status: string }>(
            `select subject_id, chapter_id, topic_id, difficulty::text as difficulty, ingestion_status::text as ingestion_status
               from questions where id = $1::uuid for update`,
            [questionId],
          )
        ).rows[0];
        if (!cur) return;
        // Fill only null columns, never overwrite, and never create a taxonomy mismatch with existing values.
        const chapter =
          cur.chapter_id ?? (p.chapterId && (cur.subject_id === null || cur.subject_id === p.subjectId) ? p.chapterId : null);
        const aiChapterApplied = cur.chapter_id === null && chapter !== null;
        const subject = cur.subject_id ?? (aiChapterApplied ? p.subjectId : null);
        const topic = cur.topic_id ?? (aiChapterApplied ? p.topicId : null);
        await tx.query(
          `update questions set subject_id = $2::uuid, chapter_id = $3::uuid, topic_id = $4::uuid,
                  difficulty = coalesce(difficulty, $5::difficulty),
                  ingestion_status = case when ingestion_status = 'IMPORTED' then 'CLASSIFIED'::ingestion_status else ingestion_status end
            where id = $1::uuid`,
          [questionId, subject, chapter, topic, p.difficulty],
        );
        await audit(tx, 'ai.classified', 'question', questionId, { subject_id: subject, chapter_id: chapter, topic_id: topic });
      });
    },

    async setIngestionStatus(questionId, status) {
      await db.withService((tx) =>
        tx.query(`update questions set ingestion_status = $2::ingestion_status where id = $1::uuid and ingestion_status <> $2::ingestion_status`, [
          questionId,
          status,
        ]),
      );
    },

    async findSolutionByAiRun(aiRunId) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<SolutionRow>(
          `select ${SOLUTION_COLS} from solution_versions where ai_run_id = $1::uuid order by version desc limit 1`,
          [aiRunId],
        );
        return rows[0] ? toSolution(rows[0]) : null;
      });
    },

    async insertSolution(s: NewSolution) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<SolutionRow>(
          `insert into solution_versions(question_id, version, final_answer, summary, steps, formulas, concepts, alternatives, shortcuts,
                                         common_mistakes, sympy_checks, provenance, ai_run_id)
           values ($1::uuid, 1, $2::jsonb, $3, $4::jsonb, $5::jsonb, array(select jsonb_array_elements_text($6::jsonb)), $7::jsonb,
                   $8::jsonb, $9::jsonb, $10::jsonb, 'AI_GENERATED', $11::uuid)
           returning ${SOLUTION_COLS}`,
          [
            s.questionId,
            json(s.finalAnswer),
            s.summary,
            json(s.steps),
            json(s.formulas),
            json(s.concepts),
            json(s.alternatives),
            json(s.shortcuts),
            json(s.commonMistakes),
            json(s.sympyChecks),
            s.aiRunId,
          ],
        );
        const row = rows[0];
        if (!row) throw new Error('solution insert returned no row');
        await audit(tx, 'ai.solution_created', 'solution_version', row.id, { question_id: s.questionId, version: row.version });
        return toSolution(row);
      });
    },

    async getSolution(id) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<SolutionRow>(`select ${SOLUTION_COLS} from solution_versions where id = $1::uuid`, [id]);
        return rows[0] ? toSolution(rows[0]) : null;
      });
    },

    async findLatestSolution(questionId) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<SolutionRow>(
          `select ${SOLUTION_COLS} from solution_versions where question_id = $1::uuid order by version desc limit 1`,
          [questionId],
        );
        return rows[0] ? toSolution(rows[0]) : null;
      });
    },

    async applySeo(questionId, title, description) {
      await db.withService((tx) =>
        tx.query(
          `update questions set seo_title = coalesce(seo_title, $2), seo_description = coalesce(seo_description, $3)
            where id = $1::uuid and (seo_title is null or seo_description is null)`,
          [questionId, title, description],
        ),
      );
    },

    async recordVerification(run: NewVerificationRun) {
      return db.withService(async (tx) => {
        // Lock the row and re-read the status: a human/admin decision made after the handler read the question must win.
        const cur = (
          await tx.query<{ verification_status: string }>(`select verification_status::text as verification_status from questions where id = $1::uuid for update`, [run.questionId])
        ).rows[0];
        const protectedStatus = cur && (cur.verification_status === 'HUMAN_VERIFIED' || cur.verification_status === 'DISPUTED') ? cur.verification_status : null;
        const resultingStatus = protectedStatus ?? run.resultingStatus;
        const ins = await tx.query<{ id: string }>(
          `insert into verification_runs(question_id, solution_version_id, job_id, rules_version, outcome, resulting_status, reasons, started_at, finished_at)
           values ($1::uuid, $2::uuid, $3::uuid, $4, $5::verification_outcome, $6::verification_status,
                   array(select jsonb_array_elements_text($7::jsonb)), $8::timestamptz, now())
           returning id`,
          [run.questionId, run.solutionVersionId, run.jobId, run.rulesVersion, run.outcome, resultingStatus, json(run.reasons), run.startedAt.toISOString()],
        );
        const runId = ins.rows[0]?.id;
        if (!runId) throw new Error('verification_runs insert returned no row');
        for (const c of run.checks) {
          await tx.query(
            `insert into verification_checks(verification_run_id, kind, result, details, ai_run_id)
             values ($1::uuid, $2::check_kind, $3::check_result, $4::jsonb, $5::uuid)`,
            [runId, c.kind, c.result, json(c.details), c.aiRunId],
          );
        }
        // A PUBLISHED question that no longer qualifies is returned to DRAFT in the same statement (publication guard).
        let statusApplied = false;
        if (!protectedStatus) {
          const upd = await tx.query(
            `update questions set verification_status = $2::verification_status, ingestion_status = $3::ingestion_status,
                    publication_status = case when publication_status = 'PUBLISHED' and $2::text not in ('OFFICIAL_KEY_MATCHED','HUMAN_VERIFIED')
                                              then 'DRAFT'::publication_status else publication_status end
              where id = $1::uuid and verification_status not in ('HUMAN_VERIFIED','DISPUTED')
                and (verification_status <> $2::verification_status or ingestion_status <> $3::ingestion_status)`,
            [run.questionId, run.resultingStatus, run.ingestionStatus],
          );
          statusApplied = (upd.rowCount ?? 0) > 0;
        }
        await audit(tx, 'ai.verification_recorded', 'question', run.questionId, {
          verification_run_id: runId,
          outcome: run.outcome,
          resulting_status: resultingStatus,
          reasons: run.reasons,
          ...(protectedStatus ? { skipped_protected_status: protectedStatus } : {}),
        });
        return { id: runId, statusApplied, skippedProtectedStatus: protectedStatus };
      });
    },

    async markPipelineError(questionId, jobKind, jobId, error) {
      await db.withService(async (tx) => {
        const cur = (
          await tx.query<{ verification_status: string }>(`select verification_status::text as verification_status from questions where id = $1::uuid for update`, [questionId])
        ).rows[0];
        if (!cur) return;
        const human = cur.verification_status === 'HUMAN_VERIFIED' || cur.verification_status === 'DISPUTED';
        const resulting = human ? cur.verification_status : 'HUMAN_REVIEW_REQUIRED';
        await tx.query(
          `insert into verification_runs(question_id, job_id, rules_version, outcome, resulting_status, reasons, finished_at)
           values ($1::uuid, $2::uuid, 'v1', 'FAILED', $3::verification_status, array['PIPELINE_ERROR', $4::text], now())`,
          [questionId, jobId, resulting, `job:${jobKind}`],
        );
        if (!human) {
          await tx.query(
            `update questions set verification_status = 'HUMAN_REVIEW_REQUIRED', ingestion_status = 'NEEDS_ATTENTION',
                    publication_status = case when publication_status = 'PUBLISHED' then 'DRAFT'::publication_status else publication_status end
              where id = $1::uuid and verification_status not in ('HUMAN_VERIFIED','DISPUTED')`,
            [questionId],
          );
        }
        await audit(tx, 'ai.pipeline_error', 'question', questionId, { job_kind: jobKind, job_id: jobId, error: error.slice(0, 500) });
      });
    },

    async enqueueJob(job: EnqueueJob) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `select app_private.enqueue_pipeline_job($1::job_kind, $2, $3::jsonb, $4::int, $5::timestamptz, $6::uuid) as id`,
          [job.kind, job.idempotencyKey, json(job.payload) ?? '{}', job.priority ?? 100, (job.runAfter ?? new Date()).toISOString(), job.questionId],
        );
        const id = rows[0]?.id;
        if (!id) throw new Error('enqueue_pipeline_job returned no id');
        return id;
      });
    },

    async claimJob(workerId, kinds: JobKind[], leaseSeconds) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{
          id: string;
          kind: JobKind;
          idempotency_key: string;
          payload: Record<string, unknown>;
          attempts: number;
          max_attempts: number;
          question_id: string | null;
        }>(
          `select id, kind::text as kind, idempotency_key, payload, attempts, max_attempts, question_id
             from app_private.claim_pipeline_job($1, $2::text::job_kind[], $3::int)`,
          [workerId, `{${kinds.join(',')}}`, leaseSeconds],
        );
        const r = rows[0];
        if (!r) return null;
        const rec: JobRecord = {
          id: r.id,
          kind: r.kind,
          idempotencyKey: r.idempotency_key,
          payload: r.payload ?? {},
          attempts: r.attempts,
          maxAttempts: r.max_attempts,
          questionId: r.question_id,
        };
        return rec;
      });
    },

    async heartbeatJob(jobId, workerId, leaseSeconds) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{ ok: boolean }>(`select app_private.heartbeat_pipeline_job($1::uuid, $2, $3::int) as ok`, [jobId, workerId, leaseSeconds]);
        return rows[0]?.ok === true;
      });
    },

    async completeJob(jobId, workerId, result) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{ ok: boolean }>(`select app_private.complete_pipeline_job($1::uuid, $2, $3::jsonb) as ok`, [jobId, workerId, json(result) ?? '{}']);
        return rows[0]?.ok === true;
      });
    },

    async failJob(jobId, workerId, error, retryable) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{ status: string }>(`select app_private.fail_pipeline_job($1::uuid, $2, $3, $4::boolean)::text as status`, [jobId, workerId, error, retryable]);
        return rows[0]?.status ?? 'DEAD';
      });
    },

    async deferJob(jobId, workerId, runAfter, reason) {
      await db.withService((tx) =>
        tx.query(
          `update pipeline_jobs set status = 'QUEUED', run_after = $3::timestamptz, locked_by = null, locked_at = null, lease_expires_at = null,
                  attempts = greatest(attempts - 1, 0), last_error = left($4, 4000)
            where id = $1::uuid and locked_by = $2`,
          [jobId, workerId, runAfter.toISOString(), reason],
        ),
      );
    },

    async logJobEvent(jobId, level, stage, message, data) {
      await db.withService((tx) =>
        tx.query(`select app_private.log_pipeline_job_event($1::uuid, $2::job_event_level, $3, left($4, 2000), $5::jsonb)`, [jobId, level, stage, message, json(data)]),
      );
    },

    async getUsage(day, metric) {
      return db.withService(async (tx) => {
        const { rows } = await tx.query<{ value: number | string }>(`select value::float8 as value from usage_counters where day = $1::date and metric = $2`, [day, metric]);
        return rows[0] ? Number(rows[0].value) : 0;
      });
    },

    async addUsage(day, metric, delta) {
      await db.withService((tx) =>
        tx.query(
          `insert into usage_counters(day, metric, value) values ($1::date, $2, $3::bigint)
           on conflict (day, metric) do update set value = usage_counters.value + excluded.value, updated_at = now()`,
          [day, metric, Math.round(delta)],
        ),
      );
    },
  };
}

interface RunRow {
  id: string;
  task: AiTask;
  question_id: string | null;
  input_hash: string;
  status: AiRunRecord['status'];
  output: unknown;
  model: string;
}
function toRun(r: RunRow): AiRunRecord {
  return { id: r.id, task: r.task, questionId: r.question_id, inputHash: r.input_hash, status: r.status, output: r.output, model: r.model };
}
