/**
 * Local-only draft for in-progress sessions (integration plan, in git history: 1.7).
 * Holds what the server does not know yet: unsent answers, review flags, the
 * current index, elapsed time, and the `client_attempt_id` reserved per
 * question BEFORE its request is sent, so a retry is idempotent.
 * This is a convenience, not the source of truth: the server wins on conflict.
 */
import type { ResponseValue } from "@/contracts";

export type DraftResponse = {
  answer: ResponseValue | null;
  markedForReview: boolean;
  visited: boolean;
  timeSpentSec: number;
  savedAt?: string;
  /** Reserved idempotency id for this question's attempt. */
  clientAttemptId?: string;
};
export type Draft = {
  v: 1;
  current: number;
  elapsedSec: number;
  savedAt: string;
  responses: Record<string, DraftResponse>;
  /** Session UI settings (so a reload before B4 still knows the mode/limit). */
  mode?: "learning" | "test" | "cbt";
  durationSec?: number | null;
  title?: string;
};

const key = (userId: string, sessionId: string) => `projectx-drafts-v1:${userId}:${sessionId}`;

export function readDraft(userId: string, sessionId: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(userId, sessionId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && d.v === 1 && d.responses ? d : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused the write (private mode, quota). */
export function writeDraft(userId: string, sessionId: string, d: Draft): boolean {
  try {
    localStorage.setItem(key(userId, sessionId), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function deleteDraft(userId: string, sessionId: string) {
  try {
    localStorage.removeItem(key(userId, sessionId));
  } catch {
    /* ignore */
  }
}

/** Remove every draft of a user (sign-out on a shared device). */
export function clearUserDrafts(userId: string) {
  try {
    const prefix = `projectx-drafts-v1:${userId}:`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for very old browsers: RFC 4122 v4 from Math.random (only used as an idempotency id).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
