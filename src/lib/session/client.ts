"use client";

/**
 * Thin authenticated client for the private (student) endpoints used by the
 * API-mode store. Response schemas extend the contract schemas with the
 * additive fields from docs/INTEGRATION_PLAN.md 1.9 (B1-B6) as OPTIONAL, so the
 * store works both before and after the backend additions land.
 */
import { z } from "zod";
import {
  AnswerResponseSchema,
  AttemptHistoryItemSchema,
  AttemptResultSchema,
  BookmarkItemSchema,
  ChapterRefSchema,
  DoubtCreatedSchema,
  ExamRefSchema,
  MeSchema,
  MistakeItemSchema,
  PracticeQuestionSchema,
  ProgressSchema,
  SessionProgressSchema,
  SessionStatusSchema,
  SessionSummarySchema,
  StreakSchema,
  SubjectRefSchema,
  TaxonomyExamSchema,
  TaxonomyTreeSchema,
  PublicExamSchema,
  PublicSubjectSchema,
  PublicQuestionSchema,
  type CreateSessionBody,
  type SubmitAttemptBody,
} from "@projectx/contracts";
import { apiFetch } from "@/lib/api/http";
import { getToken } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

const UiMode = z.enum(["learning", "test"]);

export const SessionSummaryX = SessionSummarySchema.extend({
  ui_mode: UiMode.optional(),
  time_limit_sec: z.number().int().nullable().optional(),
});
export const AttemptResultX = AttemptResultSchema.extend({
  response: AnswerResponseSchema.optional(),
  time_spent_ms: z.number().int().nullable().optional(),
});
export type AttemptResultX = z.infer<typeof AttemptResultX>;
export const SessionCreatedX = z.object({ session: SessionSummaryX, questions: z.array(PracticeQuestionSchema) });
export const SessionDetailX = z.object({
  session: SessionSummaryX.extend({ completed_at: z.string().nullable() }),
  items: z.array(z.object({ question: PracticeQuestionSchema, attempt: AttemptResultX.nullable() })),
});
export type SessionDetailX = z.infer<typeof SessionDetailX>;
export const SessionListItemX = SessionSummaryX.extend({
  completed_at: z.string().nullable().optional(),
  last_activity_at: z.string().optional(),
  exam: ExamRefSchema.optional(),
  subject: SubjectRefSchema.nullable().optional(),
  chapter: ChapterRefSchema.nullable().optional(),
});
export type SessionListItemX = z.infer<typeof SessionListItemX>;
export const ActivityDayX = z.object({ date: z.string(), attempts: z.number(), correct: z.number(), total_time_ms: z.number() });
export type ActivityDayX = z.infer<typeof ActivityDayX>;
const MeX = MeSchema.extend({
  class_level: z.enum(["11", "12", "dropper"]).nullable().optional(),
  onboarding_completed: z.boolean().optional(),
});
export type MeX = z.infer<typeof MeX>;

async function authed<S extends z.ZodType>(path: string, opts: Omit<Parameters<typeof apiFetch<S>>[1], "token" | "base">) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  return apiFetch(path, { ...opts, token, base: "browser" });
}
const q = (params: Record<string, string | number | undefined>) => {
  const e = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][];
  return e.length ? `?${new URLSearchParams(e.map(([k, v]) => [k, String(v)])).toString()}` : "";
};

export const api = {
  me: () => authed("/users/me", { schema: MeX }).then((r) => r.data),
  patchMe: (body: Record<string, unknown>) => authed("/users/me", { schema: MeX, method: "PATCH", body }).then((r) => r.data),
  putExamPreferences: (preferences: { exam: string; is_primary: boolean }[]) =>
    authed("/users/me/exam-preferences", { schema: MeX, method: "PUT", body: { preferences } }).then((r) => r.data),
  progress: (exam?: string) => authed(`/users/me/progress${q({ exam })}`, { schema: ProgressSchema }).then((r) => r.data),
  streak: () => authed("/users/me/streak", { schema: StreakSchema }).then((r) => r.data),
  activity: (from?: string, to?: string) => authed(`/users/me/activity${q({ from, to })}`, { schema: z.array(ActivityDayX) }).then((r) => r.data),
  bookmarks: () => authed("/users/me/bookmarks?limit=100", { schema: z.array(BookmarkItemSchema) }).then((r) => r.data),
  addBookmark: (question_id: string) => authed("/users/me/bookmarks", { schema: BookmarkItemSchema, method: "POST", body: { question_id } }).then((r) => r.data),
  removeBookmark: (id: string) => authed(`/users/me/bookmarks/${id}`, { schema: z.undefined(), method: "DELETE" }),
  mistakes: () => authed("/users/me/mistakes?status=all&limit=100", { schema: z.array(MistakeItemSchema) }).then((r) => r.data),
  dismissMistake: (id: string) => authed(`/users/me/mistakes/${id}`, { schema: z.undefined(), method: "DELETE" }),
  attempts: (sessionId: string) => authed(`/users/me/attempts${q({ session_id: sessionId, limit: 100 })}`, { schema: z.array(AttemptHistoryItemSchema) }).then((r) => r.data),
  createSession: (body: CreateSessionBody & { ui_mode?: "learning" | "test"; time_limit_sec?: number }) =>
    authed("/practice/sessions", { schema: SessionCreatedX, method: "POST", body, idempotencyKey: undefined }).then((r) => r.data),
  getSession: (id: string) => authed(`/practice/sessions/${id}`, { schema: SessionDetailX }).then((r) => r.data),
  listSessions: (status = "ACTIVE,COMPLETED", limit = 10) =>
    authed(`/practice/sessions${q({ status, limit })}`, { schema: z.array(SessionListItemX) }).then((r) => r.data),
  abandonSession: (id: string) => authed(`/practice/sessions/${id}/abandon`, { schema: SessionProgressSchema, method: "POST" }).then((r) => r.data),
  completeSession: (id: string) => authed(`/practice/sessions/${id}/complete`, { schema: SessionProgressSchema, method: "POST" }).then((r) => r.data),
  submitAttempt: (body: SubmitAttemptBody) =>
    authed("/practice/attempts", { schema: AttemptResultX, method: "POST", body, idempotencyKey: body.client_attempt_id }).then((r) => r.data),
  postDoubt: (body: { body: string; question_id?: string }) => authed("/doubts", { schema: DoubtCreatedSchema, method: "POST", body }).then((r) => r.data),
};

/** Public (no auth) calls used by the client taxonomy loader and single-question launch. */
export const pub = {
  exams: () => apiFetch("/taxonomy/exams", { schema: z.array(TaxonomyExamSchema), base: "browser" }).then((r) => r.data),
  tree: (exam: string) => apiFetch(`/taxonomy/tree${q({ exam })}`, { schema: TaxonomyTreeSchema, base: "browser" }).then((r) => r.data),
  exam: (slug: string) => apiFetch(`/public/exams/${slug}`, { schema: PublicExamSchema, base: "browser" }).then((r) => r.data),
  subject: (slug: string) => apiFetch(`/public/subjects/${slug}`, { schema: PublicSubjectSchema, base: "browser" }).then((r) => r.data),
  question: (slug: string) => apiFetch(`/public/questions/${slug}`, { schema: PublicQuestionSchema, base: "browser" }).then((r) => r.data),
};

export { SessionStatusSchema };
