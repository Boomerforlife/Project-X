import type { AnswerKey } from "@/contracts";

/**
 * Checks a visitor's pick against a question's answer key in the browser (public question pages, where the answer is
 * already shown). Single: exactly that option. Multiple: exactly that set. Numerical: within the key's tolerance.
 */
export function isCorrect(answer: AnswerKey, picked: string[], value: string): boolean {
  if (answer.type === "single_correct") return picked.length === 1 && picked[0] === answer.optionId;
  if (answer.type === "multiple_correct") {
    const want = [...answer.optionIds].sort();
    const got = [...picked].sort();
    return want.length === got.length && want.every((x, i) => x === got[i]);
  }
  const n = Number(value.trim());
  return Number.isFinite(n) && Math.abs(n - answer.value) <= (answer.tolerance ?? 0) + 1e-9;
}
