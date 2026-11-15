/**
 * MOCK FIXTURE ENGINE — deterministic, parametrised sample questions.
 *
 * Each template computes its own answer and worked solution from its
 * parameters, so every generated item is correct by construction. Output is
 * shaped exactly like the draft contract (Question / Solution / Hint) and
 * carries `source.kind = "sample"`, so it can never be presented as a PYQ.
 * Generated items are not public-page eligible (no thin programmatic pages).
 */
import type { Difficulty, ExamId, Hint, Question, Solution, SubjectId, VerificationStatus } from "@/contracts";

/* ---------- Seeded RNG (mulberry32) ---------- */

export function hashString(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export class Rng {
  private a: number;
  constructor(seed: string | number) {
    this.a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  }
  next() {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Format a number without float noise: 2.5000001 → "2.5". */
export function fmt(n: number, dp = 3) {
  const r = Number(n.toFixed(dp));
  return Object.is(r, -0) ? "0" : String(r);
}

export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** TeX fraction, reduced. */
export function frac(n: number, d: number) {
  const g = gcd(n, d) || 1;
  const [p, q] = [n / g, d / g];
  return q === 1 ? `${p}` : `\\dfrac{${p}}{${q}}`;
}

/* ---------- Template shapes ---------- */

type Step = { title?: string; body: string };

export type Made =
  | { kind: "value"; stem: string; value: number; wrong: number[]; unit?: string; tolerance?: number; steps: Step[]; hint: string }
  | { kind: "choice"; stem: string; correct: string; wrong: string[]; steps: Step[]; hint: string }
  | { kind: "multi"; stem: string; correct: string[]; wrong: string[]; steps: Step[]; hint: string };

export type Template = {
  key: string;
  subject: SubjectId;
  chapter: string;
  topic?: string;
  difficulty: Difficulty;
  exams: ExamId[];
  /** How a "value" answer is asked: as a typed numerical answer, an MCQ, or alternating. */
  forms?: ("numerical" | "single")[];
  variants?: number;
  make: (r: Rng, i: number) => Made;
};

/** Mapping template: "Which X is Y?" over a list of pairs; distractors come from the same list. */
export function mapping(
  base: Omit<Template, "make" | "variants" | "forms">,
  pairs: [prompt: string, answer: string, explain?: string][],
  stem: (prompt: string) => string,
  hint: string,
): Template {
  return {
    ...base,
    forms: ["single"],
    variants: pairs.length,
    make: (r, i) => {
      const [p, a, why] = pairs[i % pairs.length];
      const others = r.shuffle([...new Set(pairs.map((x) => x[1]).filter((x) => x !== a))]).slice(0, 3);
      return {
        kind: "choice",
        stem: stem(p),
        correct: a,
        wrong: others,
        hint,
        steps: [{ body: why ?? `${p}: ${a}.` }],
      };
    },
  };
}

/** Statement-pool template: "Which of the following are correct?" */
export function statements(
  base: Omit<Template, "make" | "variants" | "forms">,
  stem: string,
  trues: [string, string][],
  falses: [string, string][],
  variants = 6,
): Template {
  return {
    ...base,
    variants,
    make: (r) => {
      const nTrue = r.int(2, 3);
      const t = r.shuffle(trues).slice(0, nTrue);
      const f = r.shuffle(falses).slice(0, 4 - nTrue);
      return {
        kind: "multi",
        stem,
        correct: t.map((x) => x[0]),
        wrong: f.map((x) => x[0]),
        hint: "Judge each statement on its own; more than one can be correct.",
        steps: [...t, ...f].map(([s, why]) => ({ body: `${s.replace(/\.$/, "")} — ${why}` })),
      };
    },
  };
}

/* ---------- Generation ---------- */

const LETTERS = ["A", "B", "C", "D", "E"];

const STATUS_CYCLE: VerificationStatus[] = [
  "ai_checked", "ai_checked", "human_reviewed", "ai_checked", "processed", "human_reviewed", "ai_checked", "ai_checked",
];

export type Generated = { question: Question; solution: Solution; hint: Hint };

export function generate(t: Template): Generated[] {
  const out: Generated[] = [];
  const seen = new Set<string>();
  const n = t.variants ?? 8;
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const r = new Rng(`${t.key}:${i}`);
    const made = t.make(r, i);
    const forms = t.forms ?? ["numerical", "single"];
    const form = made.kind === "value" ? forms[out.length % forms.length] : null;
    const answerSig =
      made.kind === "multi" ? [...made.correct].sort().join("|") + "/" + [...made.wrong].sort().join("|") : "";
    const sig = `${made.stem}|${form}|${answerSig}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const id = `g_${t.key}_${out.length + 1}`;
    const item = build(t, made, form, id, r);
    if (item) out.push(item);
  }
  return out;
}

function build(t: Template, m: Made, form: "numerical" | "single" | null, id: string, r: Rng): Generated | null {
  const status = STATUS_CYCLE[hashString(id) % STATUS_CYCLE.length];
  const base = {
    id,
    slug: id.replace(/_/g, "-"),
    subject: t.subject,
    chapter: t.chapter,
    ...(t.topic ? { topic: t.topic } : {}),
    assets: [],
    difficulty: t.difficulty,
    source: { kind: "sample" as const },
    verification: { status },
    hasSolution: true,
    publicPage: false,
  };
  const sol = (answer: Solution["answer"]): Solution => ({
    questionId: id,
    answer,
    answerProvenance: "derived",
    generatedBy: status === "human_reviewed" ? "ai_human_edited" : "ai",
    verification: { status },
    steps: m.steps,
  });
  const hint: Hint = { questionId: id, body: m.hint, generatedBy: "ai" };

  if (m.kind === "value" && form === "numerical") {
    return {
      question: { ...base, exams: t.exams.filter((e) => e !== "neet"), type: "numerical", stem: `${m.stem} ______.`, options: [] },
      solution: sol({ type: "numerical", value: m.value, tolerance: m.tolerance ?? 0 }),
      hint,
    };
  }

  let correct: string[];
  let wrong: string[];
  if (m.kind === "value") {
    // Units are TeX (e.g. "\\Omega", "m s^{-2}"): set upright, with thin spaces between symbols.
    const u = m.unit ? `\\,\\mathrm{${m.unit.replace(/ /g, "\\,")}}` : "";
    correct = [`$${fmt(m.value)}${u}$`];
    // Template distractors first; generic plausible fallbacks only if they collide.
    const v = m.value;
    const step = Math.abs(v) >= 10 ? Math.round(Math.abs(v) / 10) || 1 : 1;
    const fallback = [v * 2, v / 2, v + step, v - step, v + 2 * step, v * 3];
    wrong = [...m.wrong, ...fallback].filter((w) => Number.isFinite(w) && (v === 0 || (w > 0) === (v > 0))).map((w) => `$${fmt(w)}${u}$`);
  } else if (m.kind === "choice") {
    correct = [m.correct];
    wrong = m.wrong;
  } else {
    correct = m.correct;
    wrong = m.wrong;
  }
  // Options must be distinct, and an MCQ needs exactly four.
  const uniqWrong = [...new Set(wrong.filter((w) => !correct.includes(w)))];
  const all = [...correct, ...uniqWrong].slice(0, 4);
  if (all.length < 4 || new Set(all).size !== all.length) return null;
  const order = r.shuffle(all);
  const options = order.map((body, k) => ({ id: LETTERS[k], body }));
  const idsOf = (bodies: string[]) => options.filter((o) => bodies.includes(o.body)).map((o) => o.id);
  const stemText = m.kind === "value" ? `${m.stem}:` : m.stem;

  if (m.kind === "multi") {
    return {
      question: { ...base, exams: ["jee-advanced"], type: "multiple_correct", stem: stemText, options },
      solution: sol({ type: "multiple_correct", optionIds: idsOf(correct) }),
      hint,
    };
  }
  return {
    question: { ...base, exams: t.exams, type: "single_correct", stem: stemText, options },
    solution: sol({ type: "single_correct", optionId: idsOf(correct)[0] }),
    hint,
  };
}
