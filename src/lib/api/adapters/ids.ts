import type { Difficulty, ExamId, QuestionType, SubjectId } from "@/contracts";

/** Frontend ExamId <-> backend exam slug. `neet` is `neet-ug` on the backend. */
const EXAM_TO_API: Record<ExamId, string> = {
  "jee-main": "jee-main",
  "jee-advanced": "jee-advanced",
  neet: "neet-ug",
};
const EXAM_FROM_API: Record<string, ExamId> = {
  "jee-main": "jee-main",
  "jee-advanced": "jee-advanced",
  "neet-ug": "neet",
};

export function examToApi(id: ExamId): string {
  return EXAM_TO_API[id];
}

/** Unknown backend exams map to null ("no content" for the web). */
export function examFromApi(slug: string): ExamId | null {
  return EXAM_FROM_API[slug] ?? null;
}

const SUBJECT_SEGMENTS: Record<string, SubjectId> = {
  physics: "physics",
  chemistry: "chemistry",
  mathematics: "mathematics",
  biology: "biology",
  botany: "biology",
  zoology: "biology",
};

/**
 * Backend subject -> frontend SubjectId. NEET has `botany` and `zoology`; both
 * map to `biology` with the backend subject name as the chapter `group`.
 */
export function subjectFromApi(segment: string, subjectName?: string): { subject: SubjectId; group?: string } | null {
  const subject = SUBJECT_SEGMENTS[segment];
  if (!subject) return null;
  if (segment === "botany" || segment === "zoology") {
    return { subject, group: subjectName ?? (segment === "botany" ? "Botany" : "Zoology") };
  }
  return { subject };
}

const TYPE_FROM_API = {
  SINGLE_MCQ: "single_correct",
  MULTI_MCQ: "multiple_correct",
  NUMERICAL: "numerical",
} as const satisfies Record<string, QuestionType>;
const TYPE_TO_API = {
  single_correct: "SINGLE_MCQ",
  multiple_correct: "MULTI_MCQ",
  numerical: "NUMERICAL",
} as const satisfies Record<QuestionType, string>;

export function typeFromApi(t: keyof typeof TYPE_FROM_API): QuestionType {
  return TYPE_FROM_API[t];
}
export function typeToApi(t: QuestionType): (typeof TYPE_TO_API)[QuestionType] {
  return TYPE_TO_API[t];
}

export function difficultyFromApi(d: "EASY" | "MEDIUM" | "HARD" | null | undefined): Difficulty | undefined {
  if (!d) return undefined;
  return d.toLowerCase() as Difficulty;
}
export function difficultyToApi(d: Difficulty): "EASY" | "MEDIUM" | "HARD" {
  return d.toUpperCase() as "EASY" | "MEDIUM" | "HARD";
}
