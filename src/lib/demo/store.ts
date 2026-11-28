"use client";

/**
 * Store facade. Screens import from here and never care which backend is live:
 *  - mock mode (default): the localStorage demo store, exactly as Owner A built it;
 *  - API mode: the server-backed store in `src/lib/session/store.ts`.
 *
 * Actions that talk to a server are async. In mock mode they resolve immediately.
 * Selecting the implementation is a build-time constant (DATA_SOURCE), so the
 * unused implementation's state is never touched (API mode never writes
 * `tabby-demo-v2`).
 */
import type { Response } from "@/contracts";
import { DATA_SOURCE } from "@/lib/site";
import * as local from "./localStore";
import * as remote from "@/lib/session/store";
import type { DemoState, DemoUser, MistakeCategory, Attempt } from "./types";

const API = DATA_SOURCE === "api";

export type { StartOpts, StartListOpts, ListItem, AnswerResponseInput } from "@/lib/session/store";
export { NoQuestionsError } from "@/lib/session/store";
import type { StartListOpts, StartOpts } from "@/lib/session/store";

/** `null` until hydrated on the client. */
export const useDemo: () => DemoState | null = API ? remote.useDemo : local.useDemo;
export const getDemoState: () => DemoState = API ? remote.getDemoState : local.getDemoState;
export const demoSaveFailed: () => boolean = API ? remote.demoSaveFailed : local.demoSaveFailed;
export const dayKey = local.dayKey;
export const XP = API ? remote.XP : local.XP;

export function demoLogin(name?: string) {
  if (!API) local.demoLogin(name);
}
export function completeOnboarding(patch: Partial<DemoUser>): Promise<void> {
  if (API) return remote.completeOnboarding(patch);
  local.completeOnboarding(patch);
  return Promise.resolve();
}
export function updateUser(patch: Partial<DemoUser>): Promise<void> | void {
  return API ? remote.updateUser(patch) : local.updateUser(patch);
}
export function signOut(): void {
  if (API) void remote.signOut();
  else local.signOut();
}

export function pickQuestions(opts: Parameters<typeof local.pickQuestions>[0]): string[] {
  return API ? [] : local.pickQuestions(opts);
}
export function startPractice(opts: StartOpts): Promise<string> {
  return API ? remote.startPractice(opts) : Promise.resolve(local.startPractice(opts));
}
export { rememberPapers } from "@/lib/session/store";
/**
 * Practice over an ordered list, starting at one item (Previous/Next walk the list). API mode: a client-side list whose
 * answers post as standalone attempts. Mock mode: a local practice session over the same questions (problem items must
 * already be resolved to question ids by the caller).
 */
export function startList(opts: StartListOpts): Promise<string> {
  if (API) return remote.startList(opts);
  const ids = opts.items.flatMap((it) => ("questionId" in it ? [it.questionId] : []));
  const startId = ids[opts.startIndex ?? 0];
  const id = local.startPractice({ exam: opts.exam, mode: "learning", title: opts.title, questionIds: ids, scope: opts.scope });
  const at = startId ? (local.getDemoState().attempts[id]?.questionIds.indexOf(startId) ?? 0) : 0;
  if (at > 0) local.setCurrent(id, at);
  return Promise.resolve(id);
}
export function startPaper(paperId: string, mode: "cbt" | "test" | "learning", retryOf?: string): Promise<string> {
  return API ? remote.startPaper(paperId, mode, retryOf) : Promise.resolve(local.startPaper(paperId, mode, retryOf));
}
export function setResponse(attemptId: string, qid: string, patch: Partial<Response>) {
  return API ? remote.setResponse(attemptId, qid, patch) : local.setResponse(attemptId, qid, patch);
}
export function setCurrent(attemptId: string, index: number) {
  return API ? remote.setCurrent(attemptId, index) : local.setCurrent(attemptId, index);
}
export function tick(attemptId: string, qid: string, seconds: number) {
  return API ? remote.tick(attemptId, qid, seconds) : local.tick(attemptId, qid, seconds);
}
export function checkAnswer(attemptId: string, qid: string): Promise<void> {
  if (API) return remote.checkAnswer(attemptId, qid);
  local.checkAnswer(attemptId, qid);
  return Promise.resolve();
}
/** Resolves true when the attempt is submitted; false when API submission paused (retry). */
export function submitAttempt(attemptId: string): Promise<boolean> {
  if (API) return remote.submitAttempt(attemptId);
  local.submitAttempt(attemptId);
  return Promise.resolve(true);
}
export function discardAttempt(attemptId: string): Promise<void> {
  if (API) return remote.discardAttempt(attemptId);
  local.discardAttempt(attemptId);
  return Promise.resolve();
}
export function toggleBookmark(qid: string): Promise<void> {
  if (API) return remote.toggleBookmark(qid);
  local.toggleBookmark(qid);
  return Promise.resolve();
}
export function toggleReview(qid: string) {
  return API ? remote.toggleReview(qid) : local.toggleReview(qid);
}
export function setMistakeCategory(qid: string, category: MistakeCategory | null) {
  return API ? remote.setMistakeCategory(qid, category) : local.setMistakeCategory(qid, category);
}
export function removeMistake(qid: string): Promise<void> {
  if (API) return remote.removeMistake(qid);
  local.removeMistake(qid);
  return Promise.resolve();
}

export const attemptsList: (s: DemoState) => Attempt[] = local.attemptsList;
export const inProgress: (s: DemoState) => Attempt[] = local.inProgress;

/* ---- API-mode-only helpers (inert in mock mode) ---- */
export function useAuthStatus(): { status: remote.AuthStatus; message: string } {
  // Hook-order is constant per build: API is a module-level constant.
  return API ? remote.useAuthStatus() : { status: "ready", message: "" };
}
export function useSubmitState(attemptId: string): remote.SubmitState | null {
  return API ? remote.useSubmitState(attemptId) : null;
}
export function usePending(attemptId: string, qid: string): boolean {
  return API ? remote.usePending(attemptId, qid) : false;
}
export const ensureAttempt: (id: string) => Promise<Attempt | null> = API ? remote.ensureAttempt : () => Promise.resolve(null);
export const retryLoad: () => void = API ? remote.retryLoad : () => undefined;
export const startSingleBySlug = remote.startSingleBySlug;
/** API mode: record an answer given on a public question page (no-op in mock mode, where public pages are fixtures). */
export const recordStandaloneAttempt: typeof remote.recordStandaloneAttempt = API ? remote.recordStandaloneAttempt : () => Promise.resolve(null);
export const singleQuestionId = remote.singleQuestionId;
export const publicSlugForQuestion = remote.publicSlugForQuestion;
/** API mode: register a server-created session (diagnostic, checkpoint, plan item) under a proper title. */
export const adoptSession = remote.adoptSession;
export const reportQuestion: (questionId: string, reason: string, text: string) => Promise<void> = remote.reportQuestion;
