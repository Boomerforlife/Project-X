import { critiquePrompt } from '../prompts/critique.v1.js';
import { CritiqueOutputSchema, type CritiqueOutput } from '../schemas/critique.js';
import type { QuestionRecord, SolutionRecord } from '../repo/types.js';
import { figureAssets, runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

/** Independent critique: sees the steps but neither the stated final answer nor any official key. */
export function critique(ctx: ModuleContext, q: QuestionRecord, solution: SolutionRecord): Promise<TaskResult<CritiqueOutput>> {
  const steps = solution.steps.map((s) => ({
    title: s.title,
    text: s.blocks.flatMap((b) => (b.type === 'paragraph' ? [b.text] : [])).join('\n'),
    display_math: s.blocks.flatMap((b) => (b.type === 'math' ? [b.latex] : []))[0] ?? null,
  }));
  return runTask({
    ctx,
    task: 'CRITIQUE',
    prompt: critiquePrompt,
    input: { question: toPromptQuestion(q), solution: { summary: solution.summary, steps } },
    schema: CritiqueOutputSchema,
    questionId: q.id,
    solutionVersionId: solution.id,
    images: figureAssets(q),
    extraHashInputs: figureAssets(q).map((a) => a.id),
  });
}
