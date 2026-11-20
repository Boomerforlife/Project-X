/**
 * DEMO SCORING — mirrors the marking rules carried on each paper section.
 * In production the server scores attempts (CLAUDE.md §13: never trust a
 * client-computed score). This exists only so the demo can show results.
 */
import type { MarkingRule, MarkingScheme, Question, ResponseValue, Solution } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { registry } from "@/lib/session/registry";
import { DATA_SOURCE } from "@/lib/site";
import type { Attempt } from "./types";

export type Outcome = "correct" | "incorrect" | "partial" | "unattempted";

export function isAnswered(a: ResponseValue | null | undefined) {
  if (!a) return false;
  return Boolean((a.optionIds && a.optionIds.length) || (a.value !== undefined && a.value.trim() !== ""));
}

export function judge(q: Question, sol: Solution | null, a: ResponseValue | null | undefined): { outcome: Outcome; correctCount: number } {
  if (!isAnswered(a) || !sol) return { outcome: "unattempted", correctCount: 0 };
  const ans = sol.answer;
  if (ans.type === "numerical") {
    const v = Number(a!.value);
    if (!Number.isFinite(v)) return { outcome: "incorrect", correctCount: 0 };
    return { outcome: Math.abs(v - ans.value) <= Math.max(ans.tolerance, 1e-9) ? "correct" : "incorrect", correctCount: 0 };
  }
  const chosen = new Set(a!.optionIds ?? []);
  if (ans.type === "single_correct") {
    return { outcome: chosen.size === 1 && chosen.has(ans.optionId) ? "correct" : "incorrect", correctCount: 0 };
  }
  const right = new Set(ans.optionIds);
  const wrongChosen = [...chosen].some((id) => !right.has(id));
  if (wrongChosen) return { outcome: "incorrect", correctCount: 0 };
  if (chosen.size === right.size) return { outcome: "correct", correctCount: chosen.size };
  return { outcome: "partial", correctCount: chosen.size };
}

/**
 * Outcome of one response within an attempt. In API mode the SERVER decides
 * (registry holds `is_correct` from the attempt result); nothing is computed in
 * the browser. Local attempts (mock mode, flagged paper demo) use `judge`.
 */
export function outcomeFor(attempt: Attempt, q: Question, resp: { answer: ResponseValue | null } | undefined): { outcome: Outcome; correctCount: number } {
  if (DATA_SOURCE === "api" && !attempt.local) {
    const o = registry.outcome(`${attempt.id}:${q.id}`);
    if (!o) return { outcome: "unattempted", correctCount: 0 };
    return { outcome: o.isCorrect ? "correct" : "incorrect", correctCount: 0 };
  }
  return judge(q, catalog.solution(q.id), resp?.answer);
}

export function marksFor(rule: MarkingRule | undefined, outcome: Outcome, correctCount: number) {
  const r = rule ?? { correct: 4, incorrect: -1, unattempted: 0, partial: false };
  if (outcome === "correct") return r.correct;
  if (outcome === "incorrect") return r.incorrect;
  if (outcome === "partial") return r.partial ? correctCount : r.incorrect;
  return r.unattempted ?? 0;
}

export type QuestionResult = { questionId: string; sectionId: string; outcome: Outcome; marks: number; max: number; timeSec: number };

export type AttemptResult = {
  score: number;
  max: number;
  correct: number;
  incorrect: number;
  partial: number;
  unattempted: number;
  accuracy: number | null; // correct / attempted
  timeSec: number;
  sections: { id: string; name: string; subject: string; score: number; max: number; correct: number; incorrect: number; partial: number; unattempted: number }[];
  perQuestion: Map<string, QuestionResult>;
};

export function scoreAttempt(attempt: Attempt): AttemptResult {
  const perQuestion = new Map<string, QuestionResult>();
  const sections = attempt.sections.map((s) => {
    const row = { id: s.id, name: s.name, subject: s.subject, score: 0, max: 0, correct: 0, incorrect: 0, partial: 0, unattempted: 0 };
    // Questions under a "best n count" rule are totalled after the loop (same rule as the server's paper score).
    const capped: { marks: number; max: number }[] = [];
    for (const qid of s.questionIds) {
      const q = catalog.question(qid);
      if (!q) continue;
      const rule = (s.marking as MarkingScheme)[q.type];
      const resp = attempt.responses[qid];
      const { outcome, correctCount } = outcomeFor(attempt, q, resp);
      const server = DATA_SOURCE === "api" && !attempt.local ? registry.outcome(`${attempt.id}:${qid}`) : null;
      const marks = server ? Number(server.score) : marksFor(rule, outcome, correctCount);
      const max = rule?.correct ?? 4;
      // Like the server: answered questions compete for the n slots; unanswered ones only count towards the maximum.
      if (s.countBest && q.type === s.countBest.type) capped.push({ marks: outcome === "unattempted" ? Number.NaN : marks, max });
      else {
        row.score += marks;
        row.max += max;
      }
      row[outcome] += 1;
      perQuestion.set(qid, { questionId: qid, sectionId: s.id, outcome, marks, max, timeSec: resp?.timeSpentSec ?? 0 });
    }
    if (s.countBest) {
      const n = s.countBest.n;
      row.score += capped.flatMap((c) => (Number.isNaN(c.marks) ? [] : [c.marks])).sort((a, b) => b - a).slice(0, n).reduce((x, y) => x + y, 0);
      row.max += capped.map((c) => c.max).sort((a, b) => b - a).slice(0, n).reduce((x, y) => x + y, 0);
    }
    return row;
  });
  const sum = (k: "score" | "max" | "correct" | "incorrect" | "partial" | "unattempted") => sections.reduce((n, s) => n + s[k], 0);
  const attempted = sum("correct") + sum("incorrect") + sum("partial");
  return {
    score: sum("score"),
    max: sum("max"),
    correct: sum("correct"),
    incorrect: sum("incorrect"),
    partial: sum("partial"),
    unattempted: sum("unattempted"),
    accuracy: attempted ? sum("correct") / attempted : null,
    timeSec: Object.values(attempt.responses).reduce((n, r) => n + (r.timeSpentSec ?? 0), 0),
    sections,
    perQuestion,
  };
}

/** Human-readable answer text for review screens. */
export function answerLabel(q: Question, a: ResponseValue | null | undefined) {
  if (!isAnswered(a)) return "Not answered";
  if (q.type === "numerical") return a!.value!;
  return (a!.optionIds ?? []).slice().sort().join(", ");
}

export function keyLabel(sol: Solution | null) {
  if (!sol) return "—";
  const a = sol.answer;
  if (a.type === "numerical") return String(a.value);
  if (a.type === "single_correct") return a.optionId;
  return a.optionIds.slice().sort().join(", ");
}
