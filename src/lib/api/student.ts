/**
 * Authenticated (student) API calls. Browser only: every call uses the token
 * from `getToken()` and is never cached. Public content lives in `public.ts`.
 */
import { z } from "zod";
import { getToken } from "./auth";
import { ApiError } from "./errors";
import { apiFetch, type ApiFetchOptions } from "./http";
import {
  ActivityDaySchema,
  AttemptHistoryItemSchema,
  AttemptResultSchema,
  BookmarkItemSchema,
  DoubtCreatedSchema,
  MeSchema,
  MistakeItemSchema,
  ProgressSchema,
  SessionCreatedSchema,
  SessionDetailSchema,
  SessionListItemSchema,
  SessionProgressSchema,
  StreakSchema,
  type CreateSessionInput,
  type ExamPreferencesInput,
  type PatchMeInput,
  type SubmitAttemptInput,
} from "./schemas";

type AuthedOptions<S extends z.ZodType> = Omit<ApiFetchOptions<S>, "token" | "base">;

async function authed<S extends z.ZodType>(path: string, opts: AuthedOptions<S>) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  return apiFetch(path, { ...opts, token, base: "browser" });
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

type Page = { cursor?: string; limit?: number };

export async function me() {
  return (await authed("/users/me", { schema: MeSchema })).data;
}
export async function patchMe(body: PatchMeInput) {
  return (await authed("/users/me", { schema: MeSchema, method: "PATCH", body })).data;
}
export async function putExamPreferences(body: ExamPreferencesInput) {
  return (await authed("/users/me/exam-preferences", { schema: MeSchema, method: "PUT", body })).data;
}
export async function progress(exam?: string) {
  return (await authed(`/users/me/progress${qs({ exam })}`, { schema: ProgressSchema })).data;
}
export async function streak() {
  return (await authed("/users/me/streak", { schema: StreakSchema })).data;
}
/** Per-day activity (heatmap). Default window: last 120 days. */
export async function activity(from?: string, to?: string) {
  return (await authed(`/users/me/activity${qs({ from, to })}`, { schema: z.array(ActivityDaySchema) })).data;
}
export async function attempts(f: { questionId?: string; sessionId?: string } & Page = {}) {
  const path = `/users/me/attempts${qs({ question_id: f.questionId, session_id: f.sessionId, cursor: f.cursor, limit: f.limit })}`;
  const r = await authed(path, { schema: z.array(AttemptHistoryItemSchema) });
  return { data: r.data, nextCursor: r.meta?.page?.next_cursor ?? null };
}

export async function listBookmarks(p: Page = {}) {
  const r = await authed(`/users/me/bookmarks${qs({ cursor: p.cursor, limit: p.limit })}`, { schema: z.array(BookmarkItemSchema) });
  return { data: r.data, nextCursor: r.meta?.page?.next_cursor ?? null };
}
export async function addBookmark(questionId: string, note?: string) {
  return (await authed("/users/me/bookmarks", { schema: BookmarkItemSchema, method: "POST", body: { question_id: questionId, ...(note ? { note } : {}) } })).data;
}
export async function removeBookmark(questionId: string) {
  await authed(`/users/me/bookmarks/${encodeURIComponent(questionId)}`, { schema: z.undefined(), method: "DELETE" });
}

export async function listMistakes(f: { status?: "open" | "resolved" | "all" } & Page = {}) {
  const r = await authed(`/users/me/mistakes${qs({ status: f.status ?? "all", cursor: f.cursor, limit: f.limit })}`, {
    schema: z.array(MistakeItemSchema),
  });
  return { data: r.data, nextCursor: r.meta?.page?.next_cursor ?? null };
}
export async function dismissMistake(questionId: string) {
  await authed(`/users/me/mistakes/${encodeURIComponent(questionId)}`, { schema: z.undefined(), method: "DELETE" });
}

/** Same `client_request_id` replays the same session (idempotent). 422 NO_QUESTIONS when nothing is eligible. */
export async function createSession(body: CreateSessionInput) {
  return (await authed("/practice/sessions", { schema: SessionCreatedSchema, method: "POST", body })).data;
}
export async function getSession(id: string) {
  return (await authed(`/practice/sessions/${encodeURIComponent(id)}`, { schema: SessionDetailSchema })).data;
}
export async function listSessions(f: { status?: ("ACTIVE" | "COMPLETED" | "ABANDONED")[] } & Page = {}) {
  const r = await authed(`/practice/sessions${qs({ status: f.status?.join(","), cursor: f.cursor, limit: f.limit })}`, {
    schema: z.array(SessionListItemSchema),
  });
  return { data: r.data, nextCursor: r.meta?.page?.next_cursor ?? null };
}
export async function abandonSession(id: string) {
  return (await authed(`/practice/sessions/${encodeURIComponent(id)}/abandon`, { schema: SessionProgressSchema, method: "POST" })).data;
}
export async function completeSession(id: string) {
  return (await authed(`/practice/sessions/${encodeURIComponent(id)}/complete`, { schema: SessionProgressSchema, method: "POST" })).data;
}
/** Idempotent on `client_attempt_id` (sent as the Idempotency-Key too); never auto-retried. */
export async function submitAttempt(body: SubmitAttemptInput) {
  return (
    await authed("/practice/attempts", { schema: AttemptResultSchema, method: "POST", body, idempotencyKey: body.client_attempt_id })
  ).data;
}

/** Question reports ride on doubts until a reports endpoint exists: `[REPORT:<reason>] <text>`. */
export async function postDoubt(body: { body: string; question_id?: string }) {
  return (await authed("/doubts", { schema: DoubtCreatedSchema, method: "POST", body })).data;
}
