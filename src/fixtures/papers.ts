/**
 * MOCK FIXTURE — demo papers.
 *
 * Every paper here is assembled from SAMPLE questions (see ./bank). Papers of
 * kind "pyq" mirror the *structure* of a real sitting (year/session/shift and
 * section pattern) so the PYQ UI can be reviewed, but `isDemo: true` and the
 * UI says plainly that the questions are not from that sitting. Dates are
 * left null on purpose: we do not invent sitting dates.
 */
import type { ExamId, MarkingScheme, Paper, QuestionType, SubjectId } from "@/contracts";
import { EXAMS } from "@/lib/exams";
import { Rng } from "./bank/engine";
import { getBank } from "./bank";
import { chapters } from "./syllabus";

type SectionSpec = { id: string; name: string; subject: SubjectId; group?: string; counts: Partial<Record<QuestionType, number>> };

type PaperSpec = {
  id: string;
  exam: ExamId;
  kind: "pyq" | "mock";
  title: string;
  year?: number;
  session?: string;
  shift?: number;
  durationMinutes: number;
  sections: SectionSpec[];
};

const mainSections = (counts: SectionSpec["counts"] = { single_correct: 20, numerical: 5 }): SectionSpec[] => [
  { id: "phy", name: "Physics", subject: "physics", counts },
  { id: "chem", name: "Chemistry", subject: "chemistry", counts },
  { id: "math", name: "Mathematics", subject: "mathematics", counts },
];
const advSections = (): SectionSpec[] =>
  mainSections({ single_correct: 4, multiple_correct: 3, numerical: 6 });
const neetSections = (): SectionSpec[] => [
  { id: "phy", name: "Physics", subject: "physics", counts: { single_correct: 45 } },
  { id: "chem", name: "Chemistry", subject: "chemistry", counts: { single_correct: 45 } },
  { id: "bot", name: "Botany", subject: "biology", group: "Botany", counts: { single_correct: 45 } },
  { id: "zoo", name: "Zoology", subject: "biology", group: "Zoology", counts: { single_correct: 45 } },
];

const SPECS: PaperSpec[] = [
  // JEE Main — PYQ-format demo papers
  { id: "jee-main-2025-jan-s1", exam: "jee-main", kind: "pyq", title: "JEE Main 2025 · January · Shift 1", year: 2025, session: "January", shift: 1, durationMinutes: 180, sections: mainSections() },
  { id: "jee-main-2025-jan-s2", exam: "jee-main", kind: "pyq", title: "JEE Main 2025 · January · Shift 2", year: 2025, session: "January", shift: 2, durationMinutes: 180, sections: mainSections() },
  { id: "jee-main-2025-apr-s1", exam: "jee-main", kind: "pyq", title: "JEE Main 2025 · April · Shift 1", year: 2025, session: "April", shift: 1, durationMinutes: 180, sections: mainSections() },
  { id: "jee-main-2024-jan-s1", exam: "jee-main", kind: "pyq", title: "JEE Main 2024 · January · Shift 1", year: 2024, session: "January", shift: 1, durationMinutes: 180, sections: mainSections() },
  { id: "jee-main-2024-apr-s2", exam: "jee-main", kind: "pyq", title: "JEE Main 2024 · April · Shift 2", year: 2024, session: "April", shift: 2, durationMinutes: 180, sections: mainSections() },
  // JEE Advanced
  { id: "jee-adv-2025-p1", exam: "jee-advanced", kind: "pyq", title: "JEE Advanced 2025 · Paper 1", year: 2025, session: "Paper 1", durationMinutes: 180, sections: advSections() },
  { id: "jee-adv-2025-p2", exam: "jee-advanced", kind: "pyq", title: "JEE Advanced 2025 · Paper 2", year: 2025, session: "Paper 2", durationMinutes: 180, sections: advSections() },
  { id: "jee-adv-2024-p1", exam: "jee-advanced", kind: "pyq", title: "JEE Advanced 2024 · Paper 1", year: 2024, session: "Paper 1", durationMinutes: 180, sections: advSections() },
  // NEET
  { id: "neet-2025", exam: "neet", kind: "pyq", title: "NEET UG 2025", year: 2025, session: "May", durationMinutes: 180, sections: neetSections() },
  { id: "neet-2024", exam: "neet", kind: "pyq", title: "NEET UG 2024", year: 2024, session: "May", durationMinutes: 180, sections: neetSections() },
  // Mock tests
  { id: "mock-jee-main-full-1", exam: "jee-main", kind: "mock", title: "JEE Main Full Mock 1", durationMinutes: 180, sections: mainSections() },
  { id: "mock-jee-main-full-2", exam: "jee-main", kind: "mock", title: "JEE Main Full Mock 2", durationMinutes: 180, sections: mainSections() },
  { id: "mock-jee-main-physics", exam: "jee-main", kind: "mock", title: "JEE Main Physics Sectional", durationMinutes: 60, sections: [mainSections()[0]] },
  { id: "mock-jee-main-quick", exam: "jee-main", kind: "mock", title: "JEE Main 30-minute Sprint", durationMinutes: 30, sections: mainSections({ single_correct: 4, numerical: 1 }) },
  { id: "mock-jee-adv-1", exam: "jee-advanced", kind: "mock", title: "JEE Advanced Mock 1", durationMinutes: 180, sections: advSections() },
  { id: "mock-neet-full-1", exam: "neet", kind: "mock", title: "NEET Full Mock 1", durationMinutes: 180, sections: neetSections() },
  { id: "mock-neet-biology", exam: "neet", kind: "mock", title: "NEET Biology Sectional", durationMinutes: 90, sections: neetSections().slice(2) },
  { id: "mock-neet-quick", exam: "neet", kind: "mock", title: "NEET 30-minute Sprint", durationMinutes: 30, sections: neetSections().map((s) => ({ ...s, counts: { single_correct: 6 } })) },
];

const INSTRUCTIONS: Record<ExamId, string[]> = {
  "jee-main": [
    "The paper has three sections: Physics, Chemistry and Mathematics.",
    "Each section has single-correct MCQs followed by numerical-value questions.",
    "Marking (demo configuration): +4 for a correct answer, −1 for an incorrect answer, 0 if unattempted — for both question types.",
    "You can move between sections and questions freely. Answers save as soon as you choose them; Save & Next moves on.",
  ],
  "jee-advanced": [
    "Each subject has single-correct, multiple-correct and numerical-value questions.",
    "Single correct (demo configuration): +3 correct, −1 incorrect.",
    "Multiple correct: +4 if all correct options are chosen; +1 for each correct option chosen when no wrong option is chosen; −2 if any wrong option is chosen.",
    "Numerical value: +4 correct, no negative marking.",
    "The real JEE Advanced pattern changes every year; the backend will supply the rules for each paper.",
  ],
  neet: [
    "The paper has four sections: Physics, Chemistry, Botany and Zoology.",
    "All questions are single-correct MCQs.",
    "Marking (demo configuration): +4 for a correct answer, −1 for an incorrect answer, 0 if unattempted.",
  ],
};

function assemble(spec: PaperSpec): Paper {
  const { questions, templateOf } = getBank();
  const groupOf = new Map(chapters.map((c) => [`${c.subject}/${c.slug}`, c.group]));
  const marking: MarkingScheme = EXAMS[spec.exam].marking;
  const sections = spec.sections.map((sec) => {
    const ids: string[] = [];
    for (const [type, count] of Object.entries(sec.counts) as [QuestionType, number][]) {
      const pool = questions.filter(
        (q) =>
          q.subject === sec.subject &&
          q.type === type &&
          q.exams.includes(spec.exam) &&
          (!sec.group || groupOf.get(`${q.subject}/${q.chapter}`) === sec.group),
      );
      ids.push(...roundRobin(pool.map((q) => q.id), templateOf, new Rng(`${spec.id}:${sec.id}:${type}`)).slice(0, count));
    }
    return { id: sec.id, name: sec.name, subject: sec.subject, questionIds: ids, marking };
  });
  const total = sections.reduce((n, s) => n + s.questionIds.length, 0);
  return {
    id: spec.id,
    exam: spec.exam,
    kind: spec.kind,
    title: spec.title,
    year: spec.year ?? null,
    session: spec.session ?? null,
    date: null,
    shift: spec.shift ?? null,
    questionCount: total,
    durationMinutes: spec.durationMinutes,
    isDemo: true,
    sections,
    instructions: INSTRUCTIONS[spec.exam],
  };
}

/** Spread picks across templates so a paper never clusters near-identical variants. */
function roundRobin(ids: string[], templateOf: Map<string, string>, r: Rng) {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const k = templateOf.get(id) ?? id;
    groups.set(k, [...(groups.get(k) ?? []), id]);
  }
  const lists = r.shuffle([...groups.values()].map((g) => r.shuffle(g)));
  const out: string[] = [];
  for (let i = 0; out.length < ids.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

let cache: Paper[] | null = null;
export function getDemoPapers(): Paper[] {
  return (cache ??= SPECS.map(assemble));
}
