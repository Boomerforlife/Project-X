import { describe, expect, it } from 'vitest';
import {
  GradingError,
  answerKeysEqual,
  canonicalJson,
  canonicalizeAnswerKey,
  compareDecimal,
  decodeCursor,
  encodeCursor,
  gradeAttempt,
  negateDecimal,
  normalizeDecimal,
  sha256Hex,
  slugify,
  type AnswerKeyLike,
} from '../src/index';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const opts = { marks: '4', negative_marks: '1' };

describe('compareDecimal', () => {
  it.each([
    ['1', '1', 0],
    ['1.0', '1', 0],
    ['1.50', '1.5', 0],
    ['0.1', '0.10', 0],
    ['-0', '0', 0],
    ['-0.0', '0', 0],
    ['2', '10', -1],
    ['10', '2', 1],
    ['-1', '1', -1],
    ['-2', '-10', 1],
    ['0.1', '0.09', 1],
    ['2.4999999999999999', '2.5', -1],
    ['123456789012345678', '123456789012345679', -1],
    ['007', '7', 0],
  ] as const)('%s vs %s = %i', (a, b, want) => {
    expect(compareDecimal(a, b)).toBe(want);
  });
  it('rejects malformed input', () => {
    expect(() => compareDecimal('1e3', '1')).toThrow(RangeError);
    expect(() => compareDecimal('', '1')).toThrow(RangeError);
    expect(() => compareDecimal('.5', '1')).toThrow(RangeError);
    expect(() => compareDecimal('1,5', '1')).toThrow(RangeError);
  });
  it('normalizes/negates', () => {
    expect(normalizeDecimal('004.500')).toBe('4.5');
    expect(normalizeDecimal('-0.00')).toBe('0');
    expect(negateDecimal('1')).toBe('-1');
    expect(negateDecimal('-1.0')).toBe('1');
    expect(negateDecimal('0')).toBe('0');
  });
});

describe('gradeAttempt', () => {
  const single: AnswerKeyLike = { type: 'SINGLE_MCQ', correct_option_ids: [A] };
  const multi: AnswerKeyLike = { type: 'MULTI_MCQ', correct_option_ids: [A, B] };
  const num: AnswerKeyLike = {
    type: 'NUMERICAL',
    accepted_ranges: [
      { min: '2.48', max: '2.52' },
      { min: '-5', max: '-4' },
    ],
    display_value: '2.5',
  };

  it('single correct/incorrect', () => {
    expect(gradeAttempt(single, { type: 'SINGLE_MCQ', option_id: A }, opts)).toEqual({ is_correct: true, score: '4' });
    expect(gradeAttempt(single, { type: 'SINGLE_MCQ', option_id: B }, opts)).toEqual({ is_correct: false, score: '-1' });
  });
  it('single with multiple accepted options', () => {
    const k: AnswerKeyLike = { type: 'SINGLE_MCQ', correct_option_ids: [A, B] };
    expect(gradeAttempt(k, { type: 'SINGLE_MCQ', option_id: B }, opts).is_correct).toBe(true);
  });
  it('multi requires exact set (order irrelevant, no subset/superset)', () => {
    expect(gradeAttempt(multi, { type: 'MULTI_MCQ', option_ids: [B, A] }, opts).is_correct).toBe(true);
    expect(gradeAttempt(multi, { type: 'MULTI_MCQ', option_ids: [A] }, opts).is_correct).toBe(false);
    expect(gradeAttempt(multi, { type: 'MULTI_MCQ', option_ids: [A, B, C] }, opts).is_correct).toBe(false);
    expect(gradeAttempt(multi, { type: 'MULTI_MCQ', option_ids: [A, C] }, opts).is_correct).toBe(false);
  });
  it('numerical ranges are inclusive and exact', () => {
    const g = (v: string) => gradeAttempt(num, { type: 'NUMERICAL', value: v }, opts).is_correct;
    expect(g('2.5')).toBe(true);
    expect(g('2.48')).toBe(true);
    expect(g('2.52')).toBe(true);
    expect(g('2.480')).toBe(true);
    expect(g('2.4799999')).toBe(false);
    expect(g('2.520001')).toBe(false);
    expect(g('-4.5')).toBe(true);
    expect(g('-4')).toBe(true);
    expect(g('-3.99')).toBe(false);
    expect(g('0')).toBe(false);
  });
  it('float-hostile values are exact', () => {
    const k: AnswerKeyLike = { type: 'NUMERICAL', accepted_ranges: [{ min: '0.3', max: '0.3' }], display_value: '0.3' };
    expect(gradeAttempt(k, { type: 'NUMERICAL', value: '0.30' }, opts).is_correct).toBe(true);
    expect(gradeAttempt(k, { type: 'NUMERICAL', value: '0.30000000000000004' }, opts).is_correct).toBe(false);
  });
  it('score uses decimals and zero negative marking', () => {
    expect(gradeAttempt(single, { type: 'SINGLE_MCQ', option_id: A }, { marks: '4.00', negative_marks: '1.00' }).score).toBe('4');
    expect(gradeAttempt(single, { type: 'SINGLE_MCQ', option_id: B }, { marks: 4, negative_marks: 0 }).score).toBe('0');
    expect(gradeAttempt(single, { type: 'SINGLE_MCQ', option_id: B }, { marks: 4, negative_marks: 0.25 }).score).toBe('-0.25');
  });
  it('type mismatch throws GradingError (VALIDATION_ERROR)', () => {
    expect(() => gradeAttempt(single, { type: 'NUMERICAL', value: '1' }, opts)).toThrow(GradingError);
    try {
      gradeAttempt(num, { type: 'SINGLE_MCQ', option_id: A }, opts);
    } catch (e) {
      expect((e as GradingError).code).toBe('VALIDATION_ERROR');
    }
  });
  it('PARTIAL_MULTI behaves as STANDARD', () => {
    expect(
      gradeAttempt(multi, { type: 'MULTI_MCQ', option_ids: [A] }, { ...opts, marking_scheme: 'PARTIAL_MULTI' }).is_correct,
    ).toBe(false);
  });
});

describe('answerKeysEqual / canonicalize', () => {
  it('MCQ set equality regardless of order/dupes', () => {
    expect(
      answerKeysEqual({ type: 'MULTI_MCQ', correct_option_ids: [B, A] }, { type: 'MULTI_MCQ', correct_option_ids: [A, B, A] }),
    ).toBe(true);
    expect(
      answerKeysEqual({ type: 'MULTI_MCQ', correct_option_ids: [A] }, { type: 'MULTI_MCQ', correct_option_ids: [A, B] }),
    ).toBe(false);
    expect(
      answerKeysEqual({ type: 'SINGLE_MCQ', correct_option_ids: [A] }, { type: 'MULTI_MCQ', correct_option_ids: [A] }),
    ).toBe(false);
  });
  it('numerical compares ranges numerically, ignores display_value', () => {
    const x: AnswerKeyLike = { type: 'NUMERICAL', accepted_ranges: [{ min: '2.50', max: '3' }, { min: '1', max: '1' }], display_value: '2.5' };
    const y: AnswerKeyLike = { type: 'NUMERICAL', accepted_ranges: [{ min: '1.0', max: '1' }, { min: '2.5', max: '3.0' }], display_value: '2.50' };
    expect(answerKeysEqual(x, y)).toBe(true);
    expect(answerKeysEqual(x, { ...y, accepted_ranges: [{ min: '1', max: '1' }] } as AnswerKeyLike)).toBe(false);
  });
  it('null never equal', () => {
    expect(answerKeysEqual(null, null)).toBe(false);
  });
  it('canonical sorts ids and ranges', () => {
    expect(canonicalizeAnswerKey({ type: 'MULTI_MCQ', correct_option_ids: [D, A, D] })).toEqual({
      type: 'MULTI_MCQ',
      correct_option_ids: [A, D],
    });
    const k = canonicalizeAnswerKey({
      type: 'NUMERICAL',
      accepted_ranges: [{ min: '10', max: '11' }, { min: '2', max: '3' }],
      display_value: '2',
    });
    expect(k.type === 'NUMERICAL' && k.accepted_ranges[0]?.min).toBe('2');
  });
});

describe('canonicalJson / sha256Hex', () => {
  it('sorts keys deeply and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
  });
  it('is stable regardless of key order', () => {
    expect(canonicalJson({ a: 1, b: [1, 2] })).toBe(canonicalJson({ b: [1, 2], a: 1 }));
  });
  it('sha256 known vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('slugify', () => {
  it('basic', () => {
    expect(slugify('Work, Energy and Power')).toBe('work-energy-and-power');
    expect(slugify('p-Block Elements')).toBe('p-block-elements');
    expect(slugify("Newton's Laws of Motion")).toBe('newton-s-laws-of-motion');
  });
  it('strips latex', () => {
    expect(slugify('Find $\\frac{a}{b}$ if x^2')).toBe('find-a-b-if-x-2');
  });
  it('empty and truncation', () => {
    expect(slugify('$$$')).toBe('');
    const s = slugify('word '.repeat(40));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('cursor', () => {
  it('round trips incl. unicode and null', () => {
    const c = { k: ['2026-01-01T00:00:00.000Z', 3, null, 'é'], id: A };
    const r = decodeCursor(encodeCursor(c));
    expect(r).toEqual({ ok: true, value: c });
  });
  it('rejects garbage', () => {
    for (const bad of ['', '!!!', 'abc', encodeCursor({ k: [], id: 'x' }) + '=', btoa('{"k":1}')]) {
      expect(decodeCursor(bad).ok).toBe(false);
    }
  });
});
