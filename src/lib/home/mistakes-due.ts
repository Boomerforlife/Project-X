import type { MistakeRecord } from "@/lib/demo/types";

/**
 * Gaps (in days) between the last wrong answer and the next retry, by how many
 * times the question has been missed again since the first miss
 * (`MistakeRecord.reattempts`). A simple expanding schedule: 1, 3, 7, then 21 days.
 * `MistakeRecord.at` is the last time the student got the question wrong.
 */
export const RETRY_GAPS_DAYS = [1, 3, 7, 21] as const;

const DAY_MS = 86_400_000;

export function retryGapDays(reattempts: number): number {
  const i = Math.max(0, Math.min(RETRY_GAPS_DAYS.length - 1, Math.floor(reattempts)));
  return RETRY_GAPS_DAYS[i]!;
}

/** True when an open mistake has waited at least its gap since the last wrong answer. Unparseable timestamps are never due. */
export function isMistakeDue(m: Pick<MistakeRecord, "status" | "at" | "reattempts">, now: Date): boolean {
  if (m.status !== "open") return false;
  const at = Date.parse(m.at);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at >= retryGapDays(m.reattempts) * DAY_MS;
}

/** Open mistakes that are due for a retry. */
export function mistakesDue<T extends Pick<MistakeRecord, "status" | "at" | "reattempts">>(mistakes: Record<string, T> | T[], now: Date = new Date()): T[] {
  const list = Array.isArray(mistakes) ? mistakes : Object.values(mistakes);
  return list.filter((m) => isMistakeDue(m, now));
}

export function openMistakes<T extends Pick<MistakeRecord, "status">>(mistakes: Record<string, T>): T[] {
  return Object.values(mistakes).filter((m) => m.status === "open");
}
