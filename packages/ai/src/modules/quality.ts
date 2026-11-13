import { qualityPrompt } from '../prompts/quality.v1.js';
import { QualityOutputSchema, type QualityOutput } from '../schemas/quality.js';
import type { QuestionRecord } from '../repo/types.js';
import { figureAssets, runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

export function quality(ctx: ModuleContext, q: QuestionRecord, notes: string[] = []): Promise<TaskResult<QualityOutput>> {
  const figures = figureAssets(q);
  return runTask({
    ctx,
    task: 'QUALITY',
    prompt: qualityPrompt,
    input: { question: toPromptQuestion(q), hasFigure: q.referencedAssetIds.length > 0, notes },
    schema: QualityOutputSchema,
    questionId: q.id,
    images: figures,
    extraHashInputs: figures.map((a) => a.id),
  });
}
