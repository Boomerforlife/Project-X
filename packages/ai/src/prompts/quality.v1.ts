import { DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

export interface QualityInput {
  question: PromptQuestion;
  hasFigure: boolean;
  /** Extra advisories from code, e.g. a question_type mismatch with the classifier. */
  notes?: string[];
}

export const qualityPrompt: PromptDef<QualityInput> = {
  id: 'quality',
  version: 'v1',
  system: [
    'You check whether an exam question is fit to be solved automatically and shown to students.',
    DATA_NOTICE,
    'is_complete: all data needed to solve is present (no truncated text, no missing options, no required figure absent).',
    'is_ambiguous: more than one reasonable interpretation or more than one defensible answer.',
    'ocr_errors_suspected: garbled symbols, broken LaTeX, merged words typical of OCR.',
    'missing_figure: the text refers to a figure or diagram that is not provided.',
    'issues: at most 8 short strings (each at most 300 characters).',
  ].join('\n'),
  render({ question, hasFigure, notes }) {
    const lines = [renderQuestion(question), `Figure provided: ${hasFigure ? 'yes' : 'no'}`];
    for (const n of notes ?? []) lines.push(`Note: ${n}`);
    return lines.join('\n');
  },
};
