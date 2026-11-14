import { classify, resolveClassification } from '../../modules/classify.js';
import { quality } from '../../modules/quality.js';
import { contentHashOf, moduleCtx, requireQuestion, SOLVE_VERSION, unwrap, type HandlerDeps, type HandlerOutcome, type JobInput } from './common.js';
import type { ClassificationOutput } from '../../schemas/classification.js';
import type { QuestionRecord } from '../../repo/types.js';

/** Notes fed to QUALITY so the same input (and cache entry) is produced from classify and verify. */
export function qualityNotes(q: QuestionRecord, cls: Pick<ClassificationOutput, 'question_type'> | null): string[] {
  return cls && cls.question_type !== q.questionType
    ? [`classifier suggested question type ${cls.question_type} but the question is stored as ${q.questionType}`]
    : [];
}

/** AI_CLASSIFY: classify (fills null columns only), QUALITY inline, then chain AI_SOLVE when complete and unambiguous. */
export async function handleClassify(deps: HandlerDeps, job: JobInput): Promise<HandlerOutcome> {
  const q = await requireQuestion(deps, job);
  const ctx = moduleCtx(deps, job.id);
  const taxonomy = await deps.repo.loadTaxonomy(q.examId);

  const cls = unwrap(await classify(ctx, q, taxonomy), 'classification');
  const resolved = resolveClassification(cls.value, taxonomy, q);
  await deps.repo.applyClassification(q.id, resolved.patch);

  const ql = unwrap(await quality(ctx, q, qualityNotes(q, cls.value)), 'quality check');
  const usable = ql.value.is_complete && !ql.value.is_ambiguous;
  const result = {
    stage: 'classify',
    classification_run_id: cls.runId,
    quality_run_id: ql.runId,
    confidence: cls.value.confidence,
    chapter_resolved: resolved.chapterResolved,
    question_type_mismatch: resolved.questionTypeMismatch,
    quality_ok: usable,
  };
  if (!usable) {
    await deps.repo.setIngestionStatus(q.id, 'NEEDS_ATTENTION');
    return { result, next: [] };
  }
  return {
    result,
    next: [
      {
        kind: 'AI_SOLVE',
        idempotencyKey: `AI_SOLVE:${q.id}:${contentHashOf(q)}:${SOLVE_VERSION}`,
        payload: { question_id: q.id },
        questionId: q.id,
      },
    ],
  };
}
