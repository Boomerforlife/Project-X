import type { AiAnswer } from '../schemas/answer.js';
import type { CritiqueOutput } from '../schemas/critique.js';
import type { QualityOutput } from '../schemas/quality.js';
import type { QuestionRecord, SolutionRecord } from '../repo/types.js';
import type { CheckKind, CheckResult } from '../types.js';
import { aiAnswersAgree, answerKeysEqual } from './answers.js';
import { DEFAULT_REL_TOLERANCE, type SympyCheckRequest, type SympyChecker, type SympyCheckResult } from './sympy.js';

export interface CheckOutcome {
  kind: CheckKind;
  result: CheckResult;
  details: Record<string, unknown>;
  aiRunId: string | null;
}

/** Structural problems that make a question unfit regardless of what the model says. */
export function structuralProblems(q: QuestionRecord): string[] {
  const problems: string[] = [];
  if (q.questionText.trim().length === 0) problems.push('empty question text');
  if (q.questionType === 'NUMERICAL') {
    if (q.options.length > 0) problems.push('NUMERICAL question has options');
  } else if (q.options.length < 2 || q.options.length > 5) {
    problems.push(`MCQ has ${q.options.length} options (need 2-5)`);
  }
  const known = new Set(q.assets.map((a) => a.id));
  const unresolved = q.referencedAssetIds.filter((id) => !known.has(id));
  if (unresolved.length > 0) problems.push(`unresolved asset refs: ${unresolved.length}`);
  return problems;
}

export function contentCompleteness(q: QuestionRecord, quality: { out: QualityOutput; runId: string } | null): CheckOutcome {
  const problems = structuralProblems(q);
  if (problems.length > 0) {
    return { kind: 'CONTENT_COMPLETENESS', result: 'FAIL', details: { structural: problems }, aiRunId: quality?.runId ?? null };
  }
  if (!quality) {
    return { kind: 'CONTENT_COMPLETENESS', result: 'INCONCLUSIVE', details: { reason: 'quality check unavailable' }, aiRunId: null };
  }
  const ok = quality.out.is_complete && !quality.out.is_ambiguous;
  return {
    kind: 'CONTENT_COMPLETENESS',
    result: ok ? 'PASS' : 'FAIL',
    details: { ...quality.out },
    aiRunId: quality.runId,
  };
}

export function classificationConfidence(
  q: Pick<QuestionRecord, 'chapterId'>,
  cls: { confidence: number; runId: string } | null,
): CheckOutcome {
  if (!cls) return { kind: 'CLASSIFICATION_CONFIDENCE', result: 'SKIPPED', details: { reason: 'no classification run' }, aiRunId: null };
  let result: CheckResult = cls.confidence >= 0.7 ? 'PASS' : cls.confidence < 0.4 ? 'FAIL' : 'INCONCLUSIVE';
  if (result === 'PASS' && q.chapterId === null) result = 'INCONCLUSIVE';
  return { kind: 'CLASSIFICATION_CONFIDENCE', result, details: { confidence: cls.confidence, chapter_set: q.chapterId !== null }, aiRunId: cls.runId };
}

export function officialKeyMatch(q: QuestionRecord, solution: SolutionRecord): CheckOutcome {
  if (!q.answerKey || q.answerKeySource !== 'OFFICIAL') {
    return { kind: 'OFFICIAL_KEY_MATCH', result: 'SKIPPED', details: { reason: 'no official key' }, aiRunId: null };
  }
  const equal = answerKeysEqual(solution.finalAnswer, q.answerKey);
  return {
    kind: 'OFFICIAL_KEY_MATCH',
    result: equal ? 'PASS' : 'FAIL',
    details: { solution_answer: solution.finalAnswer, official_key: q.answerKey },
    aiRunId: solution.aiRunId,
  };
}

export function independentAgreement(
  q: QuestionRecord,
  solutionAnswer: AiAnswer,
  blind: { answer: AiAnswer; confidence: number; runId: string } | null,
  blindError?: string,
): CheckOutcome {
  if (!blind) {
    return { kind: 'INDEPENDENT_ANSWER_AGREEMENT', result: 'ERROR', details: { error: blindError ?? 'blind answer unavailable' }, aiRunId: null };
  }
  const agree = aiAnswersAgree(q, solutionAnswer, blind.answer);
  let result: CheckResult;
  if (blind.confidence < 0.5) result = 'INCONCLUSIVE';
  else result = agree ? 'PASS' : 'FAIL';
  return {
    kind: 'INDEPENDENT_ANSWER_AGREEMENT',
    result,
    details: { agree, blind_answer: blind.answer, blind_confidence: blind.confidence, solution_answer: solutionAnswer },
    aiRunId: blind.runId,
  };
}

export function aiCritique(
  c: { out: CritiqueOutput; runId: string } | null,
  critiqueError?: string,
): CheckOutcome {
  if (!c) return { kind: 'AI_CRITIQUE', result: 'ERROR', details: { error: critiqueError ?? 'critique unavailable' }, aiRunId: null };
  const major = c.out.issues.filter((i) => i.severity === 'MAJOR').length;
  let result: CheckResult;
  if (c.out.verdict === 'INCORRECT' || major > 0) result = 'FAIL';
  else if (c.out.verdict === 'CORRECT') result = 'PASS';
  else result = 'INCONCLUSIVE';
  return {
    kind: 'AI_CRITIQUE',
    result,
    details: { verdict: c.out.verdict, major_issues: major, issues: c.out.issues, recomputed_answer: c.out.recomputed_answer },
    aiRunId: c.runId,
  };
}

export function sympyRequests(solution: SolutionRecord): SympyCheckRequest[] {
  return solution.sympyChecks.map((s, i) => ({
    id: `sc-${i}`,
    kind: s.kind,
    expression: s.expression,
    compare_to: s.compare_to,
    variables: Object.fromEntries(s.variables.map((v) => [v.name, v.value])),
    rel_tolerance: DEFAULT_REL_TOLERANCE,
  }));
}

export function summariseSympy(results: SympyCheckResult[], proposed: number): CheckOutcome {
  if (proposed === 0) return { kind: 'SYMPY_CHECK', result: 'SKIPPED', details: { reason: 'none proposed' }, aiRunId: null };
  let result: CheckResult;
  if (results.some((r) => r.status === 'FAIL')) result = 'FAIL';
  else if (results.length === proposed && results.every((r) => r.status === 'PASS')) result = 'PASS';
  else result = 'INCONCLUSIVE';
  return { kind: 'SYMPY_CHECK', result, details: { results }, aiRunId: null };
}

export async function sympyCheck(solution: SolutionRecord, checker: SympyChecker): Promise<CheckOutcome> {
  const reqs = sympyRequests(solution);
  if (reqs.length === 0) return summariseSympy([], 0);
  let results: SympyCheckResult[];
  try {
    results = await checker.check(reqs);
  } catch (e) {
    results = reqs.map((r) => ({ id: r.id, status: 'ERROR', computed: null, message: e instanceof Error ? e.message : String(e) }));
  }
  return summariseSympy(results, reqs.length);
}
