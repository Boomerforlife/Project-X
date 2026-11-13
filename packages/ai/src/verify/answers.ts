import type { AiAnswer } from '../schemas/answer.js';
import type { QuestionRecord } from '../repo/types.js';
import type { AnswerKey, OptionLabel } from '../types.js';
import { compareDecimal, isDecimal, normalizeDecimal } from '../util/decimal.js';

type OptionsView = Pick<QuestionRecord, 'questionType' | 'options'>;

export type MapResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** AI answer (labels) -> canonical AnswerKey (sorted option ids; NUMERIC single-point range). */
export function aiAnswerToKey(q: OptionsView, answer: AiAnswer): MapResult<AnswerKey> {
  if (q.questionType === 'NUMERICAL') {
    if (answer.kind !== 'NUMERIC' || answer.value === null) return { ok: false, reason: 'NUMERICAL question needs a NUMERIC answer' };
    const value = normalizeDecimal(answer.value);
    if (value === null) return { ok: false, reason: `value is not a decimal: ${answer.value}` };
    return { ok: true, value: { type: 'NUMERICAL', accepted_ranges: [{ min: value, max: value }], display_value: value } };
  }
  if (answer.kind !== 'OPTIONS') return { ok: false, reason: 'MCQ question needs an OPTIONS answer' };
  const labels = [...new Set(answer.labels)];
  if (labels.length === 0) return { ok: false, reason: 'no option label given' };
  if (q.questionType === 'SINGLE_MCQ' && labels.length !== 1) return { ok: false, reason: 'SINGLE_MCQ needs exactly one label' };
  const ids: string[] = [];
  for (const label of labels) {
    const opt = q.options.find((o) => o.label === label);
    if (!opt) return { ok: false, reason: `label ${label} is not an option of this question` };
    ids.push(opt.id);
  }
  ids.sort();
  return { ok: true, value: { type: q.questionType, correct_option_ids: ids } };
}

/** AnswerKey -> labels, used to show an official answer to the solver. */
export function keyToAiAnswer(q: OptionsView, key: AnswerKey): AiAnswer | null {
  if (key.type === 'NUMERICAL') return { kind: 'NUMERIC', labels: [], value: key.display_value };
  const labels: OptionLabel[] = [];
  for (const id of key.correct_option_ids) {
    const opt = q.options.find((o) => o.id === id);
    if (!opt) return null;
    labels.push(opt.label);
  }
  return { kind: 'OPTIONS', labels: labels.sort(), value: null };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
}

export function valueInRanges(value: string, ranges: { min: string; max: string }[]): boolean {
  if (!isDecimal(value)) return false;
  return ranges.some((r) => compareDecimal(value, r.min) >= 0 && compareDecimal(value, r.max) <= 0);
}

/** Does answer `candidate` satisfy `key`? (key may list several accepted SINGLE_MCQ ids or numeric ranges.) */
export function answerKeysEqual(candidate: AnswerKey, key: AnswerKey): boolean {
  if (candidate.type !== key.type) return false;
  if (candidate.type === 'NUMERICAL' && key.type === 'NUMERICAL') {
    return candidate.accepted_ranges.every((r) => valueInRanges(r.min, key.accepted_ranges) && valueInRanges(r.max, key.accepted_ranges));
  }
  if (candidate.type === 'NUMERICAL' || key.type === 'NUMERICAL') return false;
  if (key.type === 'SINGLE_MCQ') {
    return candidate.correct_option_ids.length === 1 && key.correct_option_ids.includes(candidate.correct_option_ids[0] as string);
  }
  return sameSet(candidate.correct_option_ids, key.correct_option_ids);
}

/** Independent-answer agreement between two AI answers (solver vs blind). Numeric: inside key range if any, else rel 1e-3. */
export function aiAnswersAgree(q: Pick<QuestionRecord, 'answerKey'>, a: AiAnswer, b: AiAnswer): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'OPTIONS') return sameSet(a.labels, b.labels);
  const av = a.value === null ? null : normalizeDecimal(a.value);
  const bv = b.value === null ? null : normalizeDecimal(b.value);
  if (av === null || bv === null) return false;
  if (q.answerKey?.type === 'NUMERICAL') {
    const inA = valueInRanges(av, q.answerKey.accepted_ranges);
    const inB = valueInRanges(bv, q.answerKey.accepted_ranges);
    if (inA && inB) return true;
  }
  const x = Number(av);
  const y = Number(bv);
  const scale = Math.max(Math.abs(x), Math.abs(y));
  return scale < 1e-12 ? true : Math.abs(x - y) <= 1e-3 * scale;
}

/** Does an AI answer match a stored AnswerKey? */
export function aiAnswerMatchesKey(q: OptionsView, a: AiAnswer, key: AnswerKey): boolean {
  const mapped = aiAnswerToKey(q, a);
  return mapped.ok && answerKeysEqual(mapped.value, key);
}
