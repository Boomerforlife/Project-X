/**
 * DEMO SEED — a believable two-month history for the demo student, so the
 * dashboard, heatmap, notebook and results screens have something real to
 * show. Every attempt references real bank questions and is scored by the
 * same code as live attempts. Nothing here ever leaves the browser.
 */
import type { ExamId, Response, ResponseValue, SubjectId } from "@/contracts";
import { Rng } from "@/fixtures/bank/engine";
import { catalog } from "@/lib/data/catalog";
import { EXAMS } from "@/lib/exams";
import { dayKey, daysAgo } from "./dates";
import { judge } from "./scoring";
import type { Attempt, AttemptSection, DayActivity, DemoState, MistakeCategory, MistakeRecord } from "./types";

type Seed = Pick<DemoState, "attempts" | "bookmarks" | "review" | "mistakes" | "activity"> & { joinedAt: string };

const CATS: MistakeCategory[] = ["concept", "calculation", "formula", "misread", "time"];

function simulateAnswer(r: Rng, qid: string, pCorrect: number): ResponseValue | null {
  const q = catalog.question(qid);
  const sol = catalog.solution(qid);
  if (!q || !sol) return null;
  const right = r.next() < pCorrect;
  const a = sol.answer;
  if (a.type === "numerical") return { value: right ? String(a.value) : String(a.value + r.pick([1, 2, -1, 3])) };
  if (a.type === "single_correct") {
    if (right) return { optionIds: [a.optionId] };
    return { optionIds: [r.pick(q.options.map((o) => o.id).filter((id) => id !== a.optionId))] };
  }
  if (right) return { optionIds: a.optionIds };
  const wrong = q.options.map((o) => o.id).filter((id) => !a.optionIds.includes(id));
  return { optionIds: r.next() < 0.5 ? a.optionIds.slice(0, 1) : [a.optionIds[0], r.pick(wrong)] };
}

function at(daysBack: number, hour: number, min = 0) {
  const d = daysAgo(daysBack);
  d.setHours(hour, min, 0, 0);
  return d;
}

function sectionsFor(exam: ExamId, ids: string[]): AttemptSection[] {
  const by = new Map<SubjectId, string[]>();
  for (const id of ids) {
    const q = catalog.question(id)!;
    by.set(q.subject, [...(by.get(q.subject) ?? []), id]);
  }
  return [...by.entries()].map(([subject, qids]) => ({
    id: subject,
    name: catalog.subject(subject)!.name,
    subject,
    questionIds: qids,
    marking: EXAMS[exam].marking,
  }));
}

function makeAttempt(
  r: Rng,
  base: Omit<Attempt, "responses" | "sections" | "updatedAt" | "submittedAt" | "status" | "current" | "elapsedSec" | "startedAt"> & { sections?: AttemptSection[] },
  start: Date,
  opts: { pCorrect: number; answerShare: number; submitted: boolean },
): Attempt {
  const responses: Record<string, Response> = {};
  let t = 0;
  const n = Math.round(base.questionIds.length * opts.answerShare);
  base.questionIds.forEach((qid, i) => {
    const spent = r.int(35, 160);
    const answered = i < n && (base.mode === "learning" || r.next() > 0.08);
    t += i < n ? spent : 0;
    responses[qid] = {
      questionId: qid,
      answer: answered ? simulateAnswer(r, qid, opts.pCorrect) : null,
      checked: answered && base.mode === "learning",
      markedForReview: base.mode !== "learning" && r.next() < 0.1,
      visited: i < n + 1,
      timeSpentSec: i < n ? spent : 0,
      savedAt: answered ? new Date(start.getTime() + t * 1000).toISOString() : null,
    };
  });
  const end = new Date(start.getTime() + t * 1000);
  return {
    ...base,
    sections: base.sections ?? sectionsFor(base.exam, base.questionIds),
    responses,
    startedAt: start.toISOString(),
    updatedAt: end.toISOString(),
    submittedAt: opts.submitted ? end.toISOString() : null,
    status: opts.submitted ? "submitted" : "in_progress",
    current: opts.submitted ? 0 : Math.min(n, base.questionIds.length - 1),
    elapsedSec: t,
  };
}

function pick(r: Rng, exam: ExamId, subject: SubjectId, count: number, chapter?: string) {
  let pool = catalog.questions({ exam, subject, chapter });
  if (pool.length < count) pool = catalog.questions({ exam, subject });
  const seenKeys = new Set<string>();
  const out: string[] = [];
  for (const q of r.shuffle(pool)) {
    const k = q.id.replace(/_\d+$/, "");
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    out.push(q.id);
    if (out.length === count) break;
  }
  for (const q of r.shuffle(pool)) {
    if (out.length >= count) break;
    if (!out.includes(q.id)) out.push(q.id);
  }
  return out;
}

export function buildSeed(exam: ExamId): Seed {
  const r = new Rng(`demo-seed:${exam}`);
  const [s0, s1, s2] = EXAMS[exam].subjects;
  const sprint = exam === "neet" ? "mock-neet-quick" : exam === "jee-advanced" ? "mock-jee-adv-1" : "mock-jee-main-quick";
  const paper = catalog.paper(sprint)!;
  const ch0 = catalog.chapter(s0, "electrostatics") ? "electrostatics" : undefined;

  const attempts: Attempt[] = [
    makeAttempt(r, { id: "seed_a1", exam, mode: "cbt", kind: "paper", title: paper.title, paperId: paper.id, questionIds: paper.sections.flatMap((s) => s.questionIds), sections: paper.sections, durationSec: paper.durationMinutes * 60 }, at(6, 18, 5), { pCorrect: 0.62, answerShare: 0.9, submitted: true }),
    makeAttempt(r, { id: "seed_a2", exam, mode: "test", kind: "practice", title: `${catalog.subject(s1)!.name} · mixed test`, scope: { subject: s1, source: "subject" }, questionIds: pick(r, exam, s1, 12), durationSec: 20 * 60 }, at(4, 19, 30), { pCorrect: 0.58, answerShare: 1, submitted: true }),
    makeAttempt(r, { id: "seed_a3", exam, mode: "learning", kind: "practice", title: ch0 ? "Electrostatics" : `${catalog.subject(s0)!.name} · quick practice`, scope: { subject: s0, chapter: ch0, source: ch0 ? "chapter" : "subject" }, questionIds: pick(r, exam, s0, 10, ch0), durationSec: null }, at(2, 17, 10), { pCorrect: 0.7, answerShare: 1, submitted: true }),
    makeAttempt(r, { id: "seed_a4", exam, mode: "learning", kind: "practice", title: `${catalog.subject(s2)!.name} · quick practice`, scope: { subject: s2, source: "subject" }, questionIds: pick(r, exam, s2, 10), durationSec: null }, new Date(Date.now() - 50 * 60 * 1000), { pCorrect: 0.67, answerShare: 0.3, submitted: false }),
  ];

  // Mistakes come from the seeded attempts' incorrect answers, scored for real.
  const mistakes: Record<string, MistakeRecord> = {};
  let resolvedOne = false;
  for (const a of attempts) {
    for (const qid of a.questionIds) {
      const q = catalog.question(qid)!;
      const resp = a.responses[qid];
      if (a.mode === "learning" && !resp.checked) continue;
      const { outcome } = judge(q, catalog.solution(qid), resp.answer);
      if (outcome !== "incorrect" && outcome !== "partial") continue;
      const resolve = !resolvedOne && a.id === "seed_a1";
      if (resolve) resolvedOne = true;
      mistakes[qid] = {
        questionId: qid,
        attemptId: a.id,
        at: a.updatedAt,
        category: r.next() < 0.6 ? r.pick(CATS) : null,
        status: resolve ? "resolved" : "open",
        resolvedAt: resolve ? at(1, 20).toISOString() : null,
        reattempts: resolve ? 1 : 0,
      };
    }
  }

  // Activity heatmap: ~2 months, a 19-day run a few weeks ago, and a current 6-day streak.
  const activity: Record<string, DayActivity> = {};
  const subjects = EXAMS[exam].subjects;
  for (let d = 60; d >= 1; d--) {
    const inLongRun = d >= 20 && d <= 38;
    const inCurrent = d <= 6;
    const gap = d === 7 || d === 19 || d === 39;
    const active = !gap && (inLongRun || inCurrent || r.next() < 0.55);
    if (!active) continue;
    const answered = r.int(inCurrent ? 12 : 6, inCurrent ? 34 : 30);
    const correct = Math.round(answered * (0.55 + r.next() * 0.25));
    const split: Partial<Record<SubjectId, number>> = {};
    let left = answered;
    subjects.forEach((s, i) => {
      const n = i === subjects.length - 1 ? left : r.int(0, left);
      left -= n;
      if (n) split[s] = n;
    });
    activity[dayKey(daysAgo(d))] = {
      answered,
      correct,
      xp: correct * 10 + (answered - correct) * 2,
      seconds: answered * r.int(70, 120),
      subjects: split,
    };
  }
  // Today: exactly what the in-progress attempt has checked so far.
  const a4 = attempts[3];
  const today: DayActivity = { answered: 0, correct: 0, xp: 0, seconds: 0, subjects: {} };
  for (const qid of a4.questionIds) {
    const resp = a4.responses[qid];
    if (!resp.checked) continue;
    const q = catalog.question(qid)!;
    const { outcome } = judge(q, catalog.solution(qid), resp.answer);
    today.answered++;
    today.seconds += resp.timeSpentSec;
    today.subjects[q.subject] = (today.subjects[q.subject] ?? 0) + 1;
    if (outcome === "correct") {
      today.correct++;
      today.xp += 10;
    } else today.xp += 2;
  }
  activity[dayKey()] = today;

  const all = attempts.flatMap((a) => a.questionIds);
  const bookmarks: Record<string, string> = {};
  const review: Record<string, string> = {};
  r.shuffle(all).slice(0, 5).forEach((q, i) => (bookmarks[q] = at(i + 1, 21).toISOString()));
  r.shuffle(all.filter((q) => !bookmarks[q])).slice(0, 3).forEach((q, i) => (review[q] = at(i + 2, 21).toISOString()));

  return {
    attempts: Object.fromEntries(attempts.map((a) => [a.id, a])),
    bookmarks,
    review,
    mistakes,
    activity,
    joinedAt: at(62, 10).toISOString(),
  };
}
