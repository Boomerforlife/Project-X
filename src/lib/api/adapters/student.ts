import type { ActivityDay, BookmarkItem, Me, MistakeItem } from "../schemas";
import type { CosmeticId, DayActivity, DemoUser, MistakeRecord } from "@/lib/demo/types";
import { examFromApi } from "./ids";

export type LocalPrefs = { showOnLeaderboard: boolean; cosmetic: CosmeticId | null };
export const DEFAULT_PREFS: LocalPrefs = { showOnLeaderboard: false, cosmetic: null };

/** `Me` -> the frontend profile. Missing server fields get the same defaults the demo used. */
export function toDemoUser(me: Me, prefs: LocalPrefs = DEFAULT_PREFS): DemoUser {
  return {
    name: me.display_name ?? me.email?.split("@")[0] ?? "Student",
    exam: (me.target_exam && examFromApi(me.target_exam.slug)) || "jee-main",
    classLevel: me.class_level ?? "12",
    dailyGoal: me.daily_goal_attempts,
    onboarded: me.onboarding_completed,
    joinedAt: me.created_at,
    showOnLeaderboard: prefs.showOnLeaderboard,
    cosmetic: prefs.cosmetic,
  };
}

/** Mistakes keyed by question id. `category` is a local overlay, so it starts null. */
export function toMistakeRecords(items: readonly MistakeItem[]): Record<string, MistakeRecord> {
  const out: Record<string, MistakeRecord> = {};
  for (const m of items) {
    out[m.question.id] = {
      questionId: m.question.id,
      attemptId: "",
      at: m.last_wrong_at,
      category: null,
      status: m.resolved_at ? "resolved" : "open",
      resolvedAt: m.resolved_at,
      reattempts: Math.max(0, m.wrong_count - 1),
    };
  }
  return out;
}

/** Bookmarks as questionId -> ISO time saved. */
export function toBookmarks(items: readonly BookmarkItem[]): Record<string, string> {
  return Object.fromEntries(items.map((b) => [b.question.id, b.created_at]));
}

/**
 * Daily activity for the heatmap and trends. XP is a derived display metric:
 * 10 per correct + 2 per wrong answer (not stored server-side). Per-day subject
 * split is not available from the server, so `subjects` stays empty.
 */
export function toDayActivity(days: readonly ActivityDay[]): Record<string, DayActivity> {
  const out: Record<string, DayActivity> = {};
  for (const d of days) {
    out[d.date] = {
      answered: d.attempts,
      correct: d.correct,
      xp: 10 * d.correct + 2 * (d.attempts - d.correct),
      seconds: Math.round(d.total_time_ms / 1000),
      subjects: {},
    };
  }
  return out;
}
