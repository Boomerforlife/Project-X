import { solvePrompt } from '../prompts/solve.v1.js';
import { SolutionOutputSchema, type SolutionOutput } from '../schemas/solution.js';
import type { NewSolution, QuestionRecord, SolutionStep } from '../repo/types.js';
import { aiAnswerToKey, keyToAiAnswer, type MapResult } from '../verify/answers.js';
import { figureAssets, runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

/** SOLVE sees the official answer when (and only when) the question has an OFFICIAL key. */
export function solve(ctx: ModuleContext, q: QuestionRecord): Promise<TaskResult<SolutionOutput>> {
  const official = q.answerKey && q.answerKeySource === 'OFFICIAL' ? keyToAiAnswer(q, q.answerKey) : null;
  return runTask({
    ctx,
    task: 'SOLVE',
    prompt: solvePrompt,
    input: { question: toPromptQuestion(q), officialAnswer: official },
    schema: SolutionOutputSchema,
    questionId: q.id,
    images: figureAssets(q),
    extraHashInputs: figureAssets(q).map((a) => a.id),
  });
}

export function toSolutionSteps(steps: { title: string | null; text: string; display_math: string | null }[]): SolutionStep[] {
  return steps.map((s, i) => ({
    index: i + 1,
    title: s.title,
    blocks: [
      { type: 'paragraph' as const, text: s.text },
      ...(s.display_math ? [{ type: 'math' as const, latex: s.display_math }] : []),
    ],
  }));
}

/** SolutionOutput -> solution_versions payload (AI_PIPELINE section 3 "Conversion"). */
export function toNewSolution(q: QuestionRecord, out: SolutionOutput, aiRunId: string | null): MapResult<NewSolution> {
  const key = aiAnswerToKey(q, out.answer);
  if (!key.ok) return key;
  return {
    ok: true,
    value: {
      questionId: q.id,
      finalAnswer: key.value,
      summary: out.summary,
      steps: toSolutionSteps(out.steps),
      formulas: out.formulas,
      concepts: out.concepts,
      alternatives: [],
      shortcuts: out.shortcuts,
      commonMistakes: out.common_mistakes,
      sympyChecks: out.sympy_checks,
      aiRunId,
    },
  };
}
