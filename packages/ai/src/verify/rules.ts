import type { CheckKind, CheckResult, IngestionStatus, VerificationOutcome, VerificationStatus } from '../types.js';
import { CHECK_KINDS, RULES_VERSION } from '../types.js';

export { RULES_VERSION };

export interface DecisionInput {
  currentStatus: VerificationStatus;
  /** questions.answer_key is set and answer_key_source = OFFICIAL. */
  officialKeyExists: boolean;
  /** An official_answer_keys row for the question has is_dropped = true. */
  officialKeyDropped: boolean;
  checks: Record<CheckKind, CheckResult>;
  /** Blind ANSWER run matches the official key (null when unknown / no key). Used by rule 3a. */
  blindAnswerEqualsKey: boolean | null;
  /** A pipeline job died at an AI stage (rule 6). */
  pipelineError?: boolean;
}

export interface Decision {
  outcome: VerificationOutcome;
  status: VerificationStatus;
  reasons: string[];
  ingestionStatus: IngestionStatus;
}

/** Codes of every non-PASS check. SKIPPED is only reported for CLASSIFICATION_CONFIDENCE (where it counts as a failure). */
export function nonPassReasons(checks: Record<CheckKind, CheckResult>): string[] {
  const out: string[] = [];
  for (const kind of CHECK_KINDS) {
    const r = checks[kind];
    if (r === 'PASS') continue;
    if (r === 'SKIPPED' && kind !== 'CLASSIFICATION_CONFIDENCE') continue;
    out.push(`${kind}:${r}`);
  }
  return out;
}

/** Pure decision function, rules_version v1 (AI_PIPELINE section 7). AI alone never yields HUMAN_VERIFIED. */
export function decideVerification(input: DecisionInput): Decision {
  const decision = decideRaw(input);
  if (input.currentStatus === 'HUMAN_VERIFIED' || input.currentStatus === 'DISPUTED') {
    // Rule 7: record the run only; never move a human-verified or disputed question (resolving a dispute is ADMIN-only).
    const reasons = [...decision.reasons];
    if (decision.outcome === 'FAILED') reasons.push('REVERIFY_REGRESSION');
    return { outcome: decision.outcome, status: input.currentStatus, reasons, ingestionStatus: 'CHECKED' };
  }
  return decision;
}

function decideRaw(input: DecisionInput): Decision {
  const c = input.checks;
  const nonPass = nonPassReasons(c);
  const review = (outcome: VerificationOutcome, code: string, ingestion: IngestionStatus = 'CHECKED'): Decision => ({
    outcome,
    status: 'HUMAN_REVIEW_REQUIRED',
    reasons: [code, ...nonPass],
    ingestionStatus: ingestion,
  });

  // Rule 6
  if (input.pipelineError) {
    return { outcome: 'FAILED', status: 'HUMAN_REVIEW_REQUIRED', reasons: ['PIPELINE_ERROR', ...nonPass], ingestionStatus: 'NEEDS_ATTENTION' };
  }
  // Rule 1
  if (input.officialKeyDropped) return review('NEEDS_REVIEW', 'DROPPED_BY_EXAM_BODY');
  // Rule 2
  if (c.CONTENT_COMPLETENESS !== 'PASS') return review('FAILED', 'CONTENT_INCOMPLETE', 'NEEDS_ATTENTION');

  if (input.officialKeyExists) {
    // Rule 3
    if (c.OFFICIAL_KEY_MATCH === 'FAIL') {
      if (c.INDEPENDENT_ANSWER_AGREEMENT === 'PASS' && input.blindAnswerEqualsKey === false && c.SYMPY_CHECK === 'PASS') {
        return { outcome: 'FAILED', status: 'DISPUTED', reasons: ['KEY_CONFLICT_STRONG', ...nonPass], ingestionStatus: 'CHECKED' };
      }
      return review('FAILED', 'OFFICIAL_KEY_MISMATCH');
    }
    // Rule 4
    if (c.OFFICIAL_KEY_MATCH === 'PASS') {
      if (c.AI_CRITIQUE === 'FAIL' || c.SYMPY_CHECK === 'FAIL') return review('NEEDS_REVIEW', 'SOLUTION_QUALITY');
      const reasons = ['OFFICIAL_KEY_MATCHED', ...nonPass];
      if (c.INDEPENDENT_ANSWER_AGREEMENT === 'FAIL') reasons.push('BLIND_ANSWER_DISAGREES');
      return { outcome: 'PASSED', status: 'OFFICIAL_KEY_MATCHED', reasons, ingestionStatus: 'CHECKED' };
    }
    // Official key exists but the comparison is inconclusive/errored: a human must look.
    return review('NEEDS_REVIEW', 'OFFICIAL_KEY_UNCOMPARABLE');
  }

  // Rule 5 (no official key)
  const passed =
    c.INDEPENDENT_ANSWER_AGREEMENT === 'PASS' &&
    c.AI_CRITIQUE === 'PASS' &&
    (c.SYMPY_CHECK === 'PASS' || c.SYMPY_CHECK === 'SKIPPED') &&
    c.CLASSIFICATION_CONFIDENCE === 'PASS';
  if (passed) {
    return { outcome: 'PASSED', status: 'AUTOMATED_CHECKS_PASSED', reasons: ['AUTOMATED_CHECKS_PASSED', ...nonPass], ingestionStatus: 'CHECKED' };
  }
  const anyFail =
    c.INDEPENDENT_ANSWER_AGREEMENT === 'FAIL' ||
    c.AI_CRITIQUE === 'FAIL' ||
    c.SYMPY_CHECK === 'FAIL' ||
    c.CLASSIFICATION_CONFIDENCE === 'FAIL' ||
    c.CLASSIFICATION_CONFIDENCE === 'SKIPPED';
  return anyFail ? review('FAILED', 'AUTOMATED_CHECKS_FAILED') : review('NEEDS_REVIEW', 'AUTOMATED_CHECKS_INCONCLUSIVE');
}
