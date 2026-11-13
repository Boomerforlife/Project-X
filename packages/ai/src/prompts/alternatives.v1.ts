import { DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

export const alternativesPrompt: PromptDef<{ question: PromptQuestion; answerText: string }> = {
  id: 'alternatives',
  version: 'v1',
  system: [
    'You propose up to 2 genuinely different solution approaches (for example a shortcut or a symmetry argument) for a JEE/NEET question.',
    DATA_NOTICE,
    'Each alternative has a title and 1-15 steps (text at most 2000 characters, inline LaTeX with $...$, display_math or null).',
    'Return an empty list if no meaningfully different approach exists.',
  ].join('\n'),
  render({ question, answerText }) {
    return [renderQuestion(question), `The final answer is ${answerText}.`].join('\n');
  },
};
