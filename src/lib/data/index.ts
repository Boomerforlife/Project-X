/**
 * Content data layer for SERVER components — the only place public pages read
 * content from.
 *
 * Today every function is backed by validated mock fixtures (via the catalog).
 * When Person 2's API contract is agreed, swap the implementations here
 * (keeping signatures) and add `"use cache"` + cacheLife/cacheTag for
 * revalidation. Pages and components never call fetch() directly.
 */
import { z } from "zod";
import { Chapter, Paper, Question, Solution, Subject, type ExamId, type SubjectId } from "@/contracts";
import { getBank } from "@/fixtures/bank";
import { getDemoPapers } from "@/fixtures/papers";
import { chapters as chapterFx, subjects as subjectFx } from "@/fixtures/syllabus";
import type { Track } from "@/lib/exams";
import { catalog } from "./catalog";

// Fixtures must pass the same schemas as API responses (CLAUDE.md §14).
let validated = false;
function validate() {
  if (validated) return;
  const bank = getBank();
  z.array(Subject).parse(subjectFx);
  z.array(Chapter).parse(chapterFx);
  z.array(Question).parse(bank.questions);
  z.array(Solution).parse(bank.solutions);
  z.array(Paper).parse(getDemoPapers());
  validated = true;
}

export async function getSubjects(track?: Track) {
  validate();
  return track ? catalog.subjectsForTrack(track) : catalog.subjects();
}

export async function getSubject(id: string) {
  return catalog.subject(id);
}

export async function getChapters(filter: { subject?: SubjectId; track?: Track; exam?: ExamId } | SubjectId = {}) {
  validate();
  return catalog.chapters(typeof filter === "string" ? { subject: filter } : filter);
}

export async function getChapter(subject: string, slug: string) {
  return catalog.chapter(subject, slug);
}

export async function getQuestions(filter: { subject?: SubjectId; chapter?: string; track?: Track } = {}) {
  validate();
  return catalog.questions(filter);
}

/** Questions eligible for an indexable public page. */
export async function getPublicQuestions() {
  return catalog.questions().filter((q) => q.publicPage);
}

export async function getQuestionBySlug(slug: string) {
  return catalog.questions().find((q) => q.slug === slug) ?? null;
}

/**
 * OPEN QUESTION (Person 2): are solutions public on question pages, or gated
 * behind an attempt / login? Until agreed, public pages render them.
 */
export async function getSolution(questionId: string) {
  return catalog.solution(questionId);
}

export async function getPapers(filter: { track?: Track; exam?: ExamId; kind?: "pyq" | "mock" } = {}) {
  validate();
  return catalog.papers(filter);
}

export async function getPaper(id: string) {
  return catalog.paper(id);
}

export async function getQuestionCounts(track?: Track) {
  const bySubject = new Map<string, number>();
  const byChapter = new Map<string, number>();
  const qs = catalog.questions(track ? { track } : {});
  for (const q of qs) {
    bySubject.set(q.subject, (bySubject.get(q.subject) ?? 0) + 1);
    const key = `${q.subject}/${q.chapter}`;
    byChapter.set(key, (byChapter.get(key) ?? 0) + 1);
  }
  return { bySubject, byChapter, total: qs.length };
}
