import { answerPrompt } from '../prompts/answer.v1.js';
import { AnswerOutputSchema, type AnswerOutput } from '../schemas/answer.js';
import type { QuestionRecord } from '../repo/types.js';
import { figureAssets, runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

/** Blind answer. Never receives the official key or the solver's answer. */
export function answer(ctx: ModuleContext, q: QuestionRecord): Promise<TaskResult<AnswerOutput>> {
  return runTask({
    ctx,
    task: 'ANSWER',
    prompt: answerPrompt,
    input: { question: toPromptQuestion(q) },
    schema: AnswerOutputSchema,
    questionId: q.id,
    images: figureAssets(q),
    extraHashInputs: figureAssets(q).map((a) => a.id),
  });
}
