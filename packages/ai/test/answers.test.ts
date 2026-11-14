import { describe, expect, it } from 'vitest';
import { aiAnswerMatchesKey, aiAnswerToKey, aiAnswersAgree, answerKeysEqual, keyToAiAnswer } from '../src/verify/answers.js';
import { compareDecimal, normalizeDecimal } from '../src/util/decimal.js';
import type { AnswerKey } from '../src/types.js';
import { makeQuestion, OPT } from './helpers.js';

const q = makeQuestion();
const multi = makeQuestion({ questionType: 'MULTI_MCQ' });
const num = makeQuestion({ questionType: 'NUMERICAL', options: [] });

describe('label <-> option id mapping', () => {
  it('maps labels to canonical (sorted) option ids', () => {
    const r = aiAnswerToKey(multi, { kind: 'OPTIONS', labels: ['C', 'A'], value: null });
    expect(r).toEqual({ ok: true, value: { type: 'MULTI_MCQ', correct_option_ids: [OPT.A, OPT.C].sort() } });
  });
  it('maps a single label', () => {
    expect(aiAnswerToKey(q, { kind: 'OPTIONS', labels: ['B'], value: null })).toEqual({ ok: true, value: { type: 'SINGLE_MCQ', correct_option_ids: [OPT.B] } });
  });
  it('rejects unknown labels, empty labels, multi labels for SINGLE, wrong kinds', () => {
    expect(aiAnswerToKey(q, { kind: 'OPTIONS', labels: ['E'], value: null }).ok).toBe(false);
    expect(aiAnswerToKey(q, { kind: 'OPTIONS', labels: [], value: null }).ok).toBe(false);
    expect(aiAnswerToKey(q, { kind: 'OPTIONS', labels: ['A', 'B'], value: null }).ok).toBe(false);
    expect(aiAnswerToKey(q, { kind: 'NUMERIC', labels: [], value: '1' }).ok).toBe(false);
    expect(aiAnswerToKey(num, { kind: 'OPTIONS', labels: ['A'], value: null }).ok).toBe(false);
  });
  it('maps numeric answers to a point range and normalises the decimal', () => {
    expect(aiAnswerToKey(num, { kind: 'NUMERIC', labels: [], value: '2.5' })).toEqual({
      ok: true,
      value: { type: 'NUMERICAL', accepted_ranges: [{ min: '2.5', max: '2.5' }], display_value: '2.5' },
    });
    const sci = aiAnswerToKey(num, { kind: 'NUMERIC', labels: [], value: '1e3' });
    expect(sci.ok && sci.value.type === 'NUMERICAL' && sci.value.display_value).toBe('1000');
    expect(aiAnswerToKey(num, { kind: 'NUMERIC', labels: [], value: 'abc' }).ok).toBe(false);
  });
  it('maps keys back to sorted labels and null when an id is unknown', () => {
    expect(keyToAiAnswer(multi, { type: 'MULTI_MCQ', correct_option_ids: [OPT.C, OPT.A] })).toEqual({ kind: 'OPTIONS', labels: ['A', 'C'], value: null });
    expect(keyToAiAnswer(q, { type: 'SINGLE_MCQ', correct_option_ids: ['zzz'] })).toBeNull();
    expect(keyToAiAnswer(num, { type: 'NUMERICAL', accepted_ranges: [{ min: '1', max: '2' }], display_value: '1.5' })).toEqual({ kind: 'NUMERIC', labels: [], value: '1.5' });
  });
});

describe('answerKeysEqual', () => {
  const single = (...ids: string[]): AnswerKey => ({ type: 'SINGLE_MCQ', correct_option_ids: ids });
  it('SINGLE: candidate must be one of the accepted ids', () => {
    expect(answerKeysEqual(single(OPT.A), single(OPT.A))).toBe(true);
    expect(answerKeysEqual(single(OPT.B), single(OPT.A, OPT.B))).toBe(true);
    expect(answerKeysEqual(single(OPT.C), single(OPT.A, OPT.B))).toBe(false);
  });
  it('MULTI: exact set equality regardless of order', () => {
    const m = (...ids: string[]): AnswerKey => ({ type: 'MULTI_MCQ', correct_option_ids: ids });
    expect(answerKeysEqual(m(OPT.A, OPT.B), m(OPT.B, OPT.A))).toBe(true);
    expect(answerKeysEqual(m(OPT.A), m(OPT.A, OPT.B))).toBe(false);
  });
  it('types never cross-match', () => {
    expect(answerKeysEqual(single(OPT.A), { type: 'MULTI_MCQ', correct_option_ids: [OPT.A] })).toBe(false);
  });
  it('NUMERICAL: point lies in an official range (decimal exact)', () => {
    const key: AnswerKey = { type: 'NUMERICAL', accepted_ranges: [{ min: '2.48', max: '2.52' }], display_value: '2.5' };
    const cand = (v: string): AnswerKey => ({ type: 'NUMERICAL', accepted_ranges: [{ min: v, max: v }], display_value: v });
    expect(answerKeysEqual(cand('2.5'), key)).toBe(true);
    expect(answerKeysEqual(cand('2.52'), key)).toBe(true);
    expect(answerKeysEqual(cand('2.521'), key)).toBe(false);
    expect(answerKeysEqual(cand('-2.5'), key)).toBe(false);
  });
});

describe('aiAnswersAgree (blind vs solver)', () => {
  it('options compare as sets', () => {
    expect(aiAnswersAgree(q, { kind: 'OPTIONS', labels: ['A', 'B'], value: null }, { kind: 'OPTIONS', labels: ['B', 'A'], value: null })).toBe(true);
    expect(aiAnswersAgree(q, { kind: 'OPTIONS', labels: ['A'], value: null }, { kind: 'OPTIONS', labels: ['B'], value: null })).toBe(false);
  });
  it('numeric: relative tolerance 1e-3 when there is no key range', () => {
    const n = (v: string) => ({ kind: 'NUMERIC' as const, labels: [], value: v });
    expect(aiAnswersAgree(num, n('100'), n('100.05'))).toBe(true);
    expect(aiAnswersAgree(num, n('100'), n('101'))).toBe(false);
  });
  it('numeric: both inside the key range agree', () => {
    const keyed = makeQuestion({ questionType: 'NUMERICAL', options: [], answerKey: { type: 'NUMERICAL', accepted_ranges: [{ min: '2', max: '3' }], display_value: '2.5' } });
    const n = (v: string) => ({ kind: 'NUMERIC' as const, labels: [], value: v });
    expect(aiAnswersAgree(keyed, n('2.1'), n('2.9'))).toBe(true);
  });
  it('mixed kinds disagree', () => {
    expect(aiAnswersAgree(q, { kind: 'OPTIONS', labels: ['A'], value: null }, { kind: 'NUMERIC', labels: [], value: '1' })).toBe(false);
  });
  it('aiAnswerMatchesKey goes through label mapping', () => {
    expect(aiAnswerMatchesKey(q, { kind: 'OPTIONS', labels: ['A'], value: null }, { type: 'SINGLE_MCQ', correct_option_ids: [OPT.A] })).toBe(true);
    expect(aiAnswerMatchesKey(q, { kind: 'OPTIONS', labels: ['B'], value: null }, { type: 'SINGLE_MCQ', correct_option_ids: [OPT.A] })).toBe(false);
  });
});

describe('decimal helpers', () => {
  it('compares exactly without float error', () => {
    expect(compareDecimal('0.1', '0.10')).toBe(0);
    expect(compareDecimal('-1.5', '1.5')).toBe(-1);
    expect(compareDecimal('10', '9.99999999999999999')).toBe(1);
  });
  it('normalises', () => {
    expect(normalizeDecimal(' 2.50 ')).toBe('2.50');
    expect(normalizeDecimal('1.5e2')).toBe('150');
    expect(normalizeDecimal('x')).toBeNull();
    expect(normalizeDecimal('')).toBeNull();
  });
});
