import type { AnswerKey } from "@/contracts";

/** Every option label the key accepts (single-correct keys can accept more than one when the exam body says so). */
export function acceptedOptionIds(answer: AnswerKey | null | undefined): string[] {
  if (answer?.type === "single_correct") return [answer.optionId, ...(answer.alsoAccepted ?? [])];
  if (answer?.type === "multiple_correct") return answer.optionIds;
  return [];
}

/**
 * Checks a visitor's pick against a question's answer key in the browser (public question pages, where the answer is
 * already shown). Single: one of the accepted options. Multiple: exactly that set. Numerical: inside any accepted range
 * from the key, else within the key's tolerance. Mirrors the server's gradeResponse (packages/shared/src/answers.ts).
 */
export function isCorrect(answer: AnswerKey, picked: string[], value: string): boolean {
  if (answer.type === "single_correct") return picked.length === 1 && acceptedOptionIds(answer).includes(picked[0]!);
  if (answer.type === "multiple_correct") {
    const want = [...answer.optionIds].sort();
    const got = [...picked].sort();
    return want.length === got.length && want.every((x, i) => x === got[i]);
  }
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return false;
  const eps = 1e-9;
  if (answer.ranges?.length) return answer.ranges.some((r) => n >= r.min - eps && n <= r.max + eps);
  return Math.abs(n - answer.value) <= (answer.tolerance ?? 0) + eps;
}

/** Human answer text: "option B", "option A (C also accepted)", "19.05 (accepted: 19.00 to 19.10)", "1 (also accepted: 2)". */
export function answerLabel(a: AnswerKey, optionWord = "option"): string {
  if (a.type === "single_correct") {
    const also = a.alsoAccepted ?? [];
    return also.length ? `${optionWord} ${a.optionId} (${also.join(", ")} also accepted)` : `${optionWord} ${a.optionId}`;
  }
  if (a.type === "multiple_correct") return `${optionWord}s ${a.optionIds.join(", ")}`;
  const main = a.display ?? String(a.value);
  const ranges = a.ranges ?? [];
  const fmt = (r: { min: number; max: number }) => (r.min === r.max ? String(r.min) : `${r.min} to ${r.max}`);
  if (ranges.length === 0) return main;
  if (ranges.length === 1) return ranges[0]!.min === ranges[0]!.max ? main : `${main} (accepted: ${fmt(ranges[0]!)})`;
  const others = ranges.filter((r) => !(r.min === r.max && r.min === Number(main))).map(fmt);
  return others.length ? `${main} (also accepted: ${others.join(", ")})` : main;
}
