import { compareDecimal, inRange, negateDecimal, normalizeDecimal } from './decimal';

// Structural types (kept local so @projectx/shared has no dependencies; they match @projectx/contracts).
export interface DecimalRangeLike {
  min: string;
  max: string;
}
export type AnswerKeyLike =
  | { type: 'SINGLE_MCQ'; correct_option_ids: string[] }
  | { type: 'MULTI_MCQ'; correct_option_ids: string[] }
  | { type: 'NUMERICAL'; accepted_ranges: DecimalRangeLike[]; display_value: string };
export type AnswerResponseLike =
  | { type: 'SINGLE_MCQ'; option_id: string }
  | { type: 'MULTI_MCQ'; option_ids: string[] }
  | { type: 'NUMERICAL'; value: string };

export interface GradeOptions {
  marks: string | number;
  negative_marks: string | number;
  marking_scheme?: 'STANDARD' | 'PARTIAL_MULTI';
}
export interface GradeResult {
  is_correct: boolean;
  /** decimal string, normalised (e.g. "4", "-1", "0") */
  score: string;
}

/** Thrown when the response type does not match the key type (API maps to VALIDATION_ERROR). */
export class GradingError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'GradingError';
  }
}

function numToDec(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : v;
  if (/e/i.test(s)) throw new RangeError(`invalid decimal: ${s}`);
  return normalizeDecimal(s);
}

/**
 * Grade a response against an answer key. Exact decimal comparison, no floats.
 * - SINGLE: option_id in correct_option_ids
 * - MULTI (STANDARD; PARTIAL_MULTI is reserved and treated as STANDARD): exact set equality
 * - NUMERICAL: any accepted range with min <= value <= max
 * score = correct ? marks : -negative_marks
 * @throws GradingError on type mismatch
 */
export function gradeAttempt(key: AnswerKeyLike, response: AnswerResponseLike, opts: GradeOptions): GradeResult {
  if (key.type !== response.type) {
    throw new GradingError(`response type ${response.type} does not match question type ${key.type}`);
  }
  let correct: boolean;
  if (key.type === 'SINGLE_MCQ' && response.type === 'SINGLE_MCQ') {
    correct = key.correct_option_ids.includes(response.option_id);
  } else if (key.type === 'MULTI_MCQ' && response.type === 'MULTI_MCQ') {
    const want = new Set(key.correct_option_ids);
    const got = new Set(response.option_ids);
    correct = want.size === got.size && [...want].every((id) => got.has(id));
  } else if (key.type === 'NUMERICAL' && response.type === 'NUMERICAL') {
    correct = key.accepted_ranges.some((r) => inRange(response.value, r));
  } else {
    throw new GradingError('unsupported answer type');
  }
  const marks = numToDec(opts.marks);
  const neg = numToDec(opts.negative_marks);
  return { is_correct: correct, score: correct ? marks : negateDecimal(neg) };
}

/** Canonical form: option ids sorted ascending and de-duplicated; ranges sorted by min then max. Decimal strings untouched. */
export function canonicalizeAnswerKey<K extends AnswerKeyLike>(key: K): K {
  if (key.type === 'NUMERICAL') {
    const ranges = [...key.accepted_ranges]
      .map((r) => ({ min: r.min, max: r.max }))
      .sort((a, b) => compareDecimal(a.min, b.min) || compareDecimal(a.max, b.max));
    return { type: 'NUMERICAL', accepted_ranges: ranges, display_value: key.display_value } as K;
  }
  const ids = [...new Set(key.correct_option_ids)].sort();
  return { type: key.type, correct_option_ids: ids } as K;
}

/** Semantic equality of two answer keys (set equality for MCQ; numerically equal ranges for NUMERICAL; display_value ignored). */
export function answerKeysEqual(a: AnswerKeyLike | null | undefined, b: AnswerKeyLike | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'NUMERICAL' && b.type === 'NUMERICAL') {
    const ca = canonicalizeAnswerKey(a).accepted_ranges;
    const cb = canonicalizeAnswerKey(b).accepted_ranges;
    return (
      ca.length === cb.length &&
      ca.every((r, i) => {
        const o = cb[i];
        return !!o && compareDecimal(r.min, o.min) === 0 && compareDecimal(r.max, o.max) === 0;
      })
    );
  }
  if (a.type !== 'NUMERICAL' && b.type !== 'NUMERICAL') {
    const ia = canonicalizeAnswerKey(a).correct_option_ids;
    const ib = canonicalizeAnswerKey(b).correct_option_ids;
    return ia.length === ib.length && ia.every((id, i) => id === ib[i]);
  }
  return false;
}
