/**
 * Per-device preferences that the backend does not model yet (labelled in the UI):
 * review list (LATER-L2), mistake categories (L1), leaderboard opt-in and kitty cosmetic.
 */
import type { Question } from "@/contracts";
import type { CosmeticId, MistakeCategory } from "@/lib/demo/types";

export type Prefs = {
  v: 1;
  review: Record<string, string>;
  /** Minimal copies of review-list questions so the list renders after a reload (device-local). */
  reviewStubs: Record<string, Question>;
  categories: Record<string, MistakeCategory>;
  showOnLeaderboard: boolean;
  cosmetic: CosmeticId | null;
};
export const DEFAULT_PREFS: Prefs = { v: 1, review: {}, reviewStubs: {}, categories: {}, showOnLeaderboard: true, cosmetic: null };

const key = (userId: string) => `projectx-prefs-v1:${userId}`;

export function readPrefs(userId: string): Prefs {
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw) {
      const p = JSON.parse(raw) as Prefs;
      if (p && p.v === 1) return { ...DEFAULT_PREFS, ...p };
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_PREFS;
}

export function writePrefs(userId: string, p: Prefs) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(p));
  } catch {
    /* ignore: preferences are best effort */
  }
}
