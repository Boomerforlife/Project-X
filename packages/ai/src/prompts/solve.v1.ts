import { answerFormatHelp, DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';
import type { AiAnswer } from '../schemas/answer.js';

export interface SolveInput {
  question: PromptQuestion;
  /** Present only when an OFFICIAL key exists. */
  officialAnswer?: AiAnswer | null;
}

export function describeAnswer(a: AiAnswer): string {
  return a.kind === 'NUMERIC' ? String(a.value ?? '') : a.labels.join(', ');
}

export const solvePrompt: PromptDef<SolveInput> = {
  id: 'solve',
  version: 'v1',
  system: [
    'You write clear, correct, step-by-step solutions for JEE/NEET questions for students.',
    DATA_NOTICE,
    'Use inline LaTeX with $...$ in text; put the key displayed equation of a step in display_math (LaTeX without $$) or null.',
    'steps: 1-15 steps, each text at most 2000 characters. summary at most 600 characters.',
    'formulas: named formulas used (at most 10). concepts: short names (at most 8). shortcuts and common_mistakes: at most 5 each.',
    'sympy_checks: at most 3 machine-checkable claims. Use kind NUMERIC_EVAL (expression evaluates numerically to compare_to using the',
    'given variables) or SYMBOLIC_EQUIV. Expressions may use only + - * / ^ ( ) numbers, declared variable names and the functions',
    'pi, E, sqrt, sin, cos, tan, asin, acos, atan, log, ln, exp, Abs. Use an empty list if no claim is machine-checkable.',
    'If an official answer is given, your solution MUST reach it; explain why it is correct and do not dispute it.',
  ].join('\n'),
  render({ question, officialAnswer }) {
    const lines = [renderQuestion(question), answerFormatHelp(question.questionType)];
    if (officialAnswer) lines.push(`The official answer is ${describeAnswer(officialAnswer)}. Explain how to reach it.`);
    return lines.join('\n');
  },
};
