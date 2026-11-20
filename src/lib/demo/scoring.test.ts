import { describe, expect, it } from "vitest";
import type { MarkingScheme } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { scoreAttempt } from "./scoring";
import type { Attempt, AttemptSection } from "./types";

// Fixture numericals that carry a numerical answer key (mock mode: answers are judged locally).
function numericals(n: number) {
  const out: { id: string; value: number }[] = [];
  for (const q of catalog.questions()) {
    if (q.type !== "numerical") continue;
    const a = catalog.solution(q.id)?.answer;
    if (a?.type === "numerical") out.push({ id: q.id, value: a.value });
    if (out.length === n) break;
  }
  return out;
}

const marking: MarkingScheme = { numerical: { correct: 4, incorrect: -1, unattempted: 0, partial: false } };

function attempt(section: Omit<AttemptSection, "id" | "name" | "subject" | "marking">, answers: Record<string, string>): Attempt {
  const now = new Date().toISOString();
  return {
    id: "att_test",
    exam: "jee-main",
    mode: "test",
    kind: "paper",
    title: "Test",
    questionIds: section.questionIds,
    sections: [{ id: "physics", name: "Physics", subject: "physics", marking, ...section }],
    durationSec: null,
    startedAt: now,
    updatedAt: now,
    submittedAt: now,
    status: "submitted",
    current: 0,
    elapsedSec: 0,
    responses: Object.fromEntries(
      section.questionIds.map((id) => [id, { questionId: id, answer: answers[id] ? { value: answers[id] } : null, checked: true, markedForReview: false, visited: true, timeSpentSec: 0, savedAt: now }]),
    ),
    local: true,
  } as Attempt;
}

describe("scoreAttempt: best n numericals per subject (JEE Main 2021/2024 papers)", () => {
  const qs = numericals(3);

  it("counts only the best n numerical scores and caps the maximum to n questions", () => {
    expect(qs.length).toBe(3);
    // two correct (+4 each), one wrong (-1); best 2 count -> 8 out of 8
    const answers = { [qs[0]!.id]: String(qs[0]!.value), [qs[1]!.id]: String(qs[1]!.value), [qs[2]!.id]: String(qs[2]!.value + 1000) };
    const r = scoreAttempt(attempt({ questionIds: qs.map((q) => q.id), countBest: { type: "numerical", n: 2 } }, answers));
    expect(r.score).toBe(8);
    expect(r.max).toBe(8);
    expect(r.correct).toBe(2);
    expect(r.incorrect).toBe(1);
    // Without the rule every answer counts: 4 + 4 - 1 out of 12.
    const all = scoreAttempt(attempt({ questionIds: qs.map((q) => q.id) }, answers));
    expect([all.score, all.max]).toEqual([7, 12]);
  });

  it("only answered questions compete for the n slots, as on the server", () => {
    const answers = { [qs[0]!.id]: String(qs[0]!.value), [qs[1]!.id]: String(qs[1]!.value + 1000) };
    const r = scoreAttempt(attempt({ questionIds: qs.map((q) => q.id), countBest: { type: "numerical", n: 2 } }, answers));
    // answered: +4 and -1; the unanswered third question does not replace the wrong answer
    expect([r.score, r.max]).toEqual([3, 8]);
  });
});
