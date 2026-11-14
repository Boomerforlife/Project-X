import { answerFormatHelp, DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

export interface CritiqueInput {
  question: PromptQuestion;
  /** Steps and summary only. The solver's final answer and any official key are deliberately withheld. */
  solution: { summary: string; steps: { title: string | null; text: string; display_math: string | null }[] };
}

export const critiquePrompt: PromptDef<CritiqueInput> = {
  id: 'critique',
  version: 'v1',
  system: [
    'You are a strict reviewer of JEE/NEET solutions. First recompute the answer yourself from the question, then audit the reasoning.',
    DATA_NOTICE,
    'verdict: CORRECT only if every step is valid and your recomputed answer follows from the steps; INCORRECT if you find a wrong step',
    'or your recomputed answer cannot follow from them; UNSURE if you cannot decide.',
    'issues: at most 10, severity MAJOR for anything that changes the final answer, else MINOR; step_index is 0-based or null.',
    'recomputed_answer is your own answer in the standard answer format (null only when UNSURE).',
  ].join('\n'),
  render({ question, solution }) {
    const lines = [renderQuestion(question), answerFormatHelp(question.questionType), '# Proposed solution', `Summary: ${solution.summary}`];
    solution.steps.forEach((s, i) => {
      lines.push(`Step ${i}${s.title ? ` (${s.title})` : ''}: ${s.text}`);
      if (s.display_math) lines.push(`  $$${s.display_math}$$`);
    });
    return lines.join('\n');
  },
};
