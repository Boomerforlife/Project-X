import { alternativesPrompt } from '../prompts/alternatives.v1.js';
import { AlternativesOutputSchema, type AlternativesOutput } from '../schemas/solution.js';
import type { QuestionRecord } from '../repo/types.js';
import { runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

/** Optional module (not chained by default). */
export function alternatives(ctx: ModuleContext, q: QuestionRecord, answerText: string): Promise<TaskResult<AlternativesOutput>> {
  return runTask({
    ctx,
    task: 'ALTERNATIVES',
    prompt: alternativesPrompt,
    input: { question: toPromptQuestion(q), answerText },
    schema: AlternativesOutputSchema,
    questionId: q.id,
  });
}
