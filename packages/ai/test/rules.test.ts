import { describe, expect, it } from 'vitest';
import { decideVerification, nonPassReasons, type DecisionInput } from '../src/verify/rules.js';
import { CHECK_KINDS, type CheckKind, type CheckResult, type VerificationStatus } from '../src/types.js';

const ALL_PASS: Record<CheckKind, CheckResult> = {
  OFFICIAL_KEY_MATCH: 'PASS',
  INDEPENDENT_ANSWER_AGREEMENT: 'PASS',
  SYMPY_CHECK: 'PASS',
  AI_CRITIQUE: 'PASS',
  CONTENT_COMPLETENESS: 'PASS',
  CLASSIFICATION_CONFIDENCE: 'PASS',
};

function input(over: Partial<Omit<DecisionInput, 'checks'>> & { checks?: Partial<Record<CheckKind, CheckResult>> } = {}): DecisionInput {
  const { checks, ...rest } = over;
  return {
    currentStatus: 'PENDING',
    officialKeyExists: false,
    officialKeyDropped: false,
    blindAnswerEqualsKey: null,
    ...rest,
    checks: { ...ALL_PASS, ...checks },
  };
}

interface Row {
  name: string;
  input: DecisionInput;
  status: VerificationStatus;
  outcome: 'PASSED' | 'NEEDS_REVIEW' | 'FAILED';
  ingestion: 'CHECKED' | 'NEEDS_ATTENTION';
  reason: string;
}

const noKey = { OFFICIAL_KEY_MATCH: 'SKIPPED' } as const;
const withKey = { officialKeyExists: true } as const;

const rows: Row[] = [
  { name: 'rule 1: dropped by exam body', input: input({ ...withKey, officialKeyDropped: true }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'DROPPED_BY_EXAM_BODY' },
  { name: 'rule 1 wins over incomplete content', input: input({ officialKeyDropped: true, checks: { CONTENT_COMPLETENESS: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'DROPPED_BY_EXAM_BODY' },
  { name: 'rule 2: content FAIL', input: input({ checks: { ...noKey, CONTENT_COMPLETENESS: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'NEEDS_ATTENTION', reason: 'CONTENT_INCOMPLETE' },
  { name: 'rule 2: content INCONCLUSIVE', input: input({ checks: { ...noKey, CONTENT_COMPLETENESS: 'INCONCLUSIVE' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'NEEDS_ATTENTION', reason: 'CONTENT_INCOMPLETE' },
  { name: 'rule 2 wins over key mismatch', input: input({ ...withKey, checks: { OFFICIAL_KEY_MATCH: 'FAIL', CONTENT_COMPLETENESS: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'NEEDS_ATTENTION', reason: 'CONTENT_INCOMPLETE' },
  { name: 'rule 3a: strong key conflict', input: input({ ...withKey, blindAnswerEqualsKey: false, checks: { OFFICIAL_KEY_MATCH: 'FAIL' } }), status: 'DISPUTED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'KEY_CONFLICT_STRONG' },
  { name: 'rule 3b: mismatch, sympy skipped', input: input({ ...withKey, blindAnswerEqualsKey: false, checks: { OFFICIAL_KEY_MATCH: 'FAIL', SYMPY_CHECK: 'SKIPPED' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'OFFICIAL_KEY_MISMATCH' },
  { name: 'rule 3b: mismatch, blind disagrees with solver', input: input({ ...withKey, blindAnswerEqualsKey: true, checks: { OFFICIAL_KEY_MATCH: 'FAIL', INDEPENDENT_ANSWER_AGREEMENT: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'OFFICIAL_KEY_MISMATCH' },
  { name: 'rule 3b: blind equals key even though agreeing', input: input({ ...withKey, blindAnswerEqualsKey: true, checks: { OFFICIAL_KEY_MATCH: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'OFFICIAL_KEY_MISMATCH' },
  { name: 'rule 4: key matched, all fine', input: input({ ...withKey }), status: 'OFFICIAL_KEY_MATCHED', outcome: 'PASSED', ingestion: 'CHECKED', reason: 'OFFICIAL_KEY_MATCHED' },
  { name: 'rule 4: key matched, critique FAIL', input: input({ ...withKey, checks: { AI_CRITIQUE: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'SOLUTION_QUALITY' },
  { name: 'rule 4: key matched, sympy FAIL', input: input({ ...withKey, checks: { SYMPY_CHECK: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'SOLUTION_QUALITY' },
  { name: 'rule 4: key matched, critique INCONCLUSIVE still matches', input: input({ ...withKey, checks: { AI_CRITIQUE: 'INCONCLUSIVE' } }), status: 'OFFICIAL_KEY_MATCHED', outcome: 'PASSED', ingestion: 'CHECKED', reason: 'OFFICIAL_KEY_MATCHED' },
  { name: 'rule 4: key matched, blind disagrees only flags', input: input({ ...withKey, checks: { INDEPENDENT_ANSWER_AGREEMENT: 'FAIL' } }), status: 'OFFICIAL_KEY_MATCHED', outcome: 'PASSED', ingestion: 'CHECKED', reason: 'BLIND_ANSWER_DISAGREES' },
  { name: 'rule 5: automated pass', input: input({ checks: noKey }), status: 'AUTOMATED_CHECKS_PASSED', outcome: 'PASSED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_PASSED' },
  { name: 'rule 5: automated pass with sympy skipped', input: input({ checks: { ...noKey, SYMPY_CHECK: 'SKIPPED' } }), status: 'AUTOMATED_CHECKS_PASSED', outcome: 'PASSED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_PASSED' },
  { name: 'rule 5: blind disagrees', input: input({ checks: { ...noKey, INDEPENDENT_ANSWER_AGREEMENT: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 5: critique FAIL', input: input({ checks: { ...noKey, AI_CRITIQUE: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 5: sympy FAIL', input: input({ checks: { ...noKey, SYMPY_CHECK: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 5: classification FAIL', input: input({ checks: { ...noKey, CLASSIFICATION_CONFIDENCE: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 5: classification SKIPPED counts as fail', input: input({ checks: { ...noKey, CLASSIFICATION_CONFIDENCE: 'SKIPPED' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 5: classification INCONCLUSIVE', input: input({ checks: { ...noKey, CLASSIFICATION_CONFIDENCE: 'INCONCLUSIVE' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_INCONCLUSIVE' },
  { name: 'rule 5: critique UNSURE (INCONCLUSIVE)', input: input({ checks: { ...noKey, AI_CRITIQUE: 'INCONCLUSIVE' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_INCONCLUSIVE' },
  { name: 'rule 5: sympy INCONCLUSIVE', input: input({ checks: { ...noKey, SYMPY_CHECK: 'INCONCLUSIVE' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_INCONCLUSIVE' },
  { name: 'rule 5: independent answer low confidence', input: input({ checks: { ...noKey, INDEPENDENT_ANSWER_AGREEMENT: 'INCONCLUSIVE' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_INCONCLUSIVE' },
  { name: 'rule 5: critique ERROR counts as inconclusive', input: input({ checks: { ...noKey, AI_CRITIQUE: 'ERROR' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'NEEDS_REVIEW', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_INCONCLUSIVE' },
  { name: 'rule 5: FAIL beats INCONCLUSIVE', input: input({ checks: { ...noKey, AI_CRITIQUE: 'INCONCLUSIVE', SYMPY_CHECK: 'FAIL' } }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'CHECKED', reason: 'AUTOMATED_CHECKS_FAILED' },
  { name: 'rule 6: pipeline error', input: input({ pipelineError: true, checks: noKey }), status: 'HUMAN_REVIEW_REQUIRED', outcome: 'FAILED', ingestion: 'NEEDS_ATTENTION', reason: 'PIPELINE_ERROR' },
];

describe('decideVerification (rules v1)', () => {
  it.each(rows)('$name', (row) => {
    const d = decideVerification(row.input);
    expect(d.status).toBe(row.status);
    expect(d.outcome).toBe(row.outcome);
    expect(d.ingestionStatus).toBe(row.ingestion);
    expect(d.reasons).toContain(row.reason);
  });

  it('reasons include every non-PASS check code', () => {
    const d = decideVerification(input({ checks: { ...noKey, AI_CRITIQUE: 'FAIL', SYMPY_CHECK: 'INCONCLUSIVE' } }));
    expect(d.reasons).toEqual(expect.arrayContaining(['AI_CRITIQUE:FAIL', 'SYMPY_CHECK:INCONCLUSIVE']));
    expect(d.reasons).not.toContain('OFFICIAL_KEY_MATCH:SKIPPED');
  });

  it('nonPassReasons skips SKIPPED except classification', () => {
    expect(nonPassReasons({ ...ALL_PASS, SYMPY_CHECK: 'SKIPPED', CLASSIFICATION_CONFIDENCE: 'SKIPPED' })).toEqual(['CLASSIFICATION_CONFIDENCE:SKIPPED']);
  });

  it('AI alone never produces HUMAN_VERIFIED, over every combination of check results', () => {
    const results: CheckResult[] = ['PASS', 'FAIL', 'INCONCLUSIVE', 'SKIPPED', 'ERROR'];
    let count = 0;
    const walk = (i: number, acc: Record<string, CheckResult>): void => {
      if (i === CHECK_KINDS.length) {
        for (const officialKeyExists of [true, false]) {
          for (const officialKeyDropped of [true, false]) {
            for (const blind of [true, false, null]) {
              const d = decideVerification({
                currentStatus: 'PENDING',
                officialKeyExists,
                officialKeyDropped,
                blindAnswerEqualsKey: blind,
                checks: acc as Record<CheckKind, CheckResult>,
              });
              expect(d.status).not.toBe('HUMAN_VERIFIED');
              count += 1;
            }
          }
        }
        return;
      }
      for (const r of results) walk(i + 1, { ...acc, [CHECK_KINDS[i] as string]: r });
    };
    walk(0, {});
    expect(count).toBe(5 ** 6 * 12);
  }, 60000); // 187k expect() calls; exceeds the 5s default on slower machines

  describe('rule 7: HUMAN_VERIFIED is immutable', () => {
    it('keeps the status when the run would pass', () => {
      const d = decideVerification(input({ currentStatus: 'HUMAN_VERIFIED', checks: noKey }));
      expect(d.status).toBe('HUMAN_VERIFIED');
      expect(d.outcome).toBe('PASSED');
      expect(d.reasons).not.toContain('REVERIFY_REGRESSION');
    });
    it('keeps the status and flags REVERIFY_REGRESSION when the run would fail', () => {
      const d = decideVerification(input({ currentStatus: 'HUMAN_VERIFIED', ...withKey, checks: { OFFICIAL_KEY_MATCH: 'FAIL' } }));
      expect(d.status).toBe('HUMAN_VERIFIED');
      expect(d.outcome).toBe('FAILED');
      expect(d.reasons).toContain('REVERIFY_REGRESSION');
    });
    it('keeps the status even on a strong key conflict and on pipeline errors', () => {
      const conflict = decideVerification(input({ currentStatus: 'HUMAN_VERIFIED', ...withKey, blindAnswerEqualsKey: false, checks: { OFFICIAL_KEY_MATCH: 'FAIL' } }));
      expect(conflict.status).toBe('HUMAN_VERIFIED');
      const err = decideVerification(input({ currentStatus: 'HUMAN_VERIFIED', pipelineError: true }));
      expect(err.status).toBe('HUMAN_VERIFIED');
      expect(err.ingestionStatus).toBe('CHECKED');
    });
  });

  it('DISPUTED is never moved by AI (resolving a dispute is ADMIN-only)', () => {
    const d = decideVerification(input({ currentStatus: 'DISPUTED', checks: noKey }));
    expect(d.status).toBe('DISPUTED');
    const err = decideVerification(input({ currentStatus: 'DISPUTED', pipelineError: true }));
    expect(err.status).toBe('DISPUTED');
  });
});
