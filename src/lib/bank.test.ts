import katex from "katex";
import { describe, expect, it } from "vitest";
import { parseRichText } from "@/components/content/RichText";
import { Paper, Question, Solution } from "@/contracts";
import { getBank, TEMPLATES } from "@/fixtures/bank";
import { getDemoPapers } from "@/fixtures/papers";
import { chapters } from "@/fixtures/syllabus";

describe("generated question bank", () => {
  const bank = getBank();

  it("validates against the draft contract", () => {
    for (const q of bank.questions) Question.parse(q);
    for (const s of bank.solutions) Solution.parse(s);
  });

  it("every template produces at least two variants", () => {
    for (const t of TEMPLATES) {
      const n = bank.questions.filter((q) => q.id.startsWith(`g_${t.key}_`)).length;
      expect(n, t.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("MCQs have four distinct options and answers point at real options", () => {
    const sol = new Map(bank.solutions.map((s) => [s.questionId, s]));
    for (const q of bank.questions) {
      const s = sol.get(q.id);
      if (q.hasSolution) expect(s, q.id).toBeTruthy();
      if (!s) continue;
      if (q.type === "numerical") {
        expect(q.options).toHaveLength(0);
        expect(Number.isFinite((s.answer as { value: number }).value), q.id).toBe(true);
        continue;
      }
      const bodies = q.options.map((o) => o.body.trim());
      expect(new Set(bodies).size, q.id).toBe(bodies.length);
      const ids = q.options.map((o) => o.id);
      if (s.answer.type === "single_correct") expect(ids).toContain(s.answer.optionId);
      if (s.answer.type === "multiple_correct") s.answer.optionIds.forEach((id) => expect(ids).toContain(id));
    }
  });

  it("references real chapters for the right subject, and NEET items are single-correct only", () => {
    for (const q of bank.questions) {
      const c = chapters.find((x) => x.subject === q.subject && x.slug === q.chapter);
      expect(c, q.id).toBeTruthy();
      if (q.exams.includes("neet")) expect(q.type, q.id).toBe("single_correct");
    }
  });

  it("every stem, option, step and hint is valid TeX", () => {
    const sol = new Map(bank.solutions.map((s) => [s.questionId, s]));
    const hints = new Map(bank.hints.map((h) => [h.questionId, h]));
    const check = (id: string, text: string) => {
      for (const seg of parseRichText(text)) {
        if (seg.kind === "text") continue;
        expect(() => katex.renderToString(seg.value, { throwOnError: true, strict: "ignore" }), `${id}: ${seg.value}`).not.toThrow();
        // \text{} cannot hold math-mode commands; KaTeX would silently print them in red.
        expect(seg.value, `${id}: ${seg.value}`).not.toMatch(/\\text\{[^}]*\\(?!,)[a-zA-Z]/);
      }
    };
    for (const q of bank.questions) {
      check(q.id, q.stem);
      q.options.forEach((o) => check(q.id, o.body));
      sol.get(q.id)?.steps.forEach((s) => check(q.id, s.body));
      const h = hints.get(q.id);
      if (h) check(q.id, h.body);
    }
  });

  it("never presents sample content as official", () => {
    for (const q of bank.questions) expect(q.source.kind).not.toBe("pyq");
    for (const s of bank.solutions) expect(s.answerProvenance).not.toBe("official_key");
  });
});

describe("demo papers", () => {
  const papers = getDemoPapers();

  it("validate and are clearly flagged as demo with no invented dates", () => {
    for (const p of papers) {
      Paper.parse(p);
      expect(p.isDemo).toBe(true);
      expect(p.date).toBeNull();
    }
  });

  it("fill every section to the configured size without duplicates", () => {
    const expected: Record<string, number> = { "jee-main": 75, "jee-advanced": 39, neet: 180 };
    for (const p of papers.filter((x) => x.title.match(/Full Mock|·|NEET UG/))) {
      const ids = p.sections.flatMap((s) => s.questionIds);
      expect(new Set(ids).size, p.id).toBe(ids.length);
      expect(ids.length, p.id).toBe(expected[p.exam]);
    }
  });
});
