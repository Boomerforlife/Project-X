import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Blocks } from "@/components/content/Blocks";
import { parseRichText, richTextToPlain } from "@/components/content/RichText";
import { isActive } from "@/components/layout/nav";
import type { Question } from "@/contracts";
import { getChapters, getPublicQuestions, getQuestions, getSolution, getSubjects } from "@/lib/data";
import { isCardIndexable, isChapterIndexable, isQuestionIndexable } from "@/lib/indexing";

describe("RichText", () => {
  it("splits inline and display math", () => {
    expect(parseRichText("a $x$ b $$y$$ c").map((s) => s.kind)).toEqual(["text", "inline", "text", "display", "text"]);
  });

  it("produces readable plain text for metadata", () => {
    expect(richTextToPlain("capacitance $4\\,\\mu\\text{F}$ at $50\\,\\text{V}$.")).toBe("capacitance 4 μF at 50 V.");
    expect(richTextToPlain("flux $\\dfrac{q}{6\\varepsilon_0}$")).toBe("flux q/6ε0");
    expect(richTextToPlain("angle $30^\\circ$")).toBe("angle 30°");
  });
});

describe("fixtures conform to the draft contract", () => {
  it("loads and validates (zod parse runs at import)", async () => {
    expect((await getSubjects()).length).toBe(4);
    expect((await getChapters()).length).toBeGreaterThan(40);
  });

  it("every question references a real chapter", async () => {
    const chapters = await getChapters();
    for (const q of await getQuestions()) {
      expect(chapters.some((c) => c.subject === q.subject && c.slug === q.chapter), q.id).toBe(true);
    }
  });

  it("hasSolution matches solution availability, and answers reference real options", async () => {
    for (const q of (await getQuestions()) as Question[]) {
      const sol = await getSolution(q.id);
      expect(Boolean(sol), q.id).toBe(q.hasSolution);
      if (!sol) continue;
      expect(sol.answer.type).toBe(q.type);
      const ids = q.options.map((o) => o.id);
      if (sol.answer.type === "single_correct") expect(ids).toContain(sol.answer.optionId);
      if (sol.answer.type === "multiple_correct") sol.answer.optionIds.forEach((id) => expect(ids).toContain(id));
    }
  });

  it("never labels sample content as official", async () => {
    for (const q of (await getQuestions()) as Question[]) {
      expect(q.source.kind).not.toBe("pyq");
      expect((await getSolution(q.id))?.answerProvenance).not.toBe("official_key");
    }
  });

  it("question slugs are unique", async () => {
    const slugs = (await getPublicQuestions()).map((q) => q.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("indexing policy", () => {
  const q = (over: Partial<Question>) =>
    ({ publicPage: true, hasSolution: true, verification: { status: "human_reviewed" }, ...over }) as Question;

  it("excludes disputed, solution-less and non-public questions", () => {
    expect(isQuestionIndexable(q({}))).toBe(true);
    expect(isQuestionIndexable(q({ verification: { status: "disputed" } }))).toBe(false);
    expect(isQuestionIndexable(q({ hasSolution: false }))).toBe(false);
    expect(isQuestionIndexable(q({ publicPage: false }))).toBe(false);
  });

  it("honours the server's indexable flag (undefined means indexable)", () => {
    expect(isQuestionIndexable(q({ indexable: false }))).toBe(false);
    expect(isQuestionIndexable(q({ indexable: true }))).toBe(true);
    expect(isCardIndexable({ publicPage: true })).toBe(true);
    expect(isCardIndexable({ publicPage: true, indexable: false })).toBe(false);
    expect(isCardIndexable({ publicPage: false, indexable: true })).toBe(false);
  });

  it("keeps thin chapters out of the index", () => {
    expect(isChapterIndexable(0)).toBe(false);
    expect(isChapterIndexable(5)).toBe(true);
  });
});

describe("nav active state", () => {
  it("prefers the most specific match", () => {
    expect(isActive("/jee/pyq/2025/", ["/jee/pyq", "/neet/pyq"])).toBe(true);
    expect(isActive("/jee/pyq/2025/", ["/jee"])).toBe(false);
    expect(isActive("/jee/physics/", ["/jee"])).toBe(true);
    expect(isActive("/neet/pyq/", ["/neet"])).toBe(false);
  });
});

describe("Blocks renderer", () => {
  const html = (blocks: Parameters<typeof Blocks>[0]["blocks"], fallback = "fb") => renderToStaticMarkup(Blocks({ blocks, fallback }));

  it("renders paragraph markdown-lite, inline TeX, display math, images, tables and lists", () => {
    const out = html([
      { type: "paragraph", text: "A **bold** and *italic* word with $x^2$" },
      { type: "math", latex: "E=mc^2" },
      { type: "image", asset_id: "00000000-0000-4000-8000-000000000001", alt: "A diagram", url: "https://x.test/a.png", width: 10, height: 20 },
      { type: "table", header: ["h"], rows: [["c"]] },
      { type: "list", ordered: true, items: ["one", "two"] },
    ]);
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("katex");
    expect(out).toContain('alt="A diagram"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain("overflow-x-auto");
    expect(out).toContain("<ol");
  });

  it("falls back to the RichText string when there are no blocks", () => {
    expect(html(undefined, "plain $x$")).toContain("plain");
    expect(html([], "fallback text")).toContain("fallback text");
  });
});
