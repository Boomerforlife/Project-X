import { answerFormatHelp, DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

/** Blind answer: sees only the question. */
export const answerPrompt: PromptDef<{ question: PromptQuestion }> = {
  id: 'answer',
  version: 'v1',
  system: [
    'You are an expert JEE/NEET problem solver. Solve the question independently and report only the final answer.',
    DATA_NOTICE,
    'Set confidence (0..1) to your honest probability that the answer is correct; use below 0.5 when unsure or the question is ambiguous.',
    'brief_reasoning is at most 600 characters.',
  ].join('\n'),
  render({ question }) {
    return [renderQuestion(question), answerFormatHelp(question.questionType)].join('\n');
  },
};
