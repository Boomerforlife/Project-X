import type { ExamId, MarkingScheme, SubjectId } from "@/contracts";

/**
 * Exam configuration. Marking schemes here are DEMO DEFAULTS modelled on recent
 * public notices; the authoritative rules will come from each paper returned by
 * the backend (Paper.sections[].marking), never from UI code.
 */

/** URL-level grouping: /jee/... covers JEE Main + Advanced, /neet/... covers NEET. */
export type Track = "jee" | "neet";
export const TRACKS: Track[] = ["jee", "neet"];

export type ExamConfig = {
  id: ExamId;
  track: Track;
  name: string;
  short: string;
  subjects: SubjectId[];
  blurb: string;
  pattern: string;
  durationMinutes: number;
  marking: MarkingScheme;
};

export const EXAMS: Record<ExamId, ExamConfig> = {
  "jee-main": {
    id: "jee-main",
    track: "jee",
    name: "JEE Main",
    short: "Main",
    subjects: ["physics", "chemistry", "mathematics"],
    blurb: "The national engineering entrance. Speed and accuracy across Physics, Chemistry and Mathematics.",
    pattern: "75 questions · 3 hours · MCQs and numerical answers",
    durationMinutes: 180,
    marking: {
      single_correct: { correct: 4, incorrect: -1, unattempted: 0, partial: false },
      numerical: { correct: 4, incorrect: -1, unattempted: 0, partial: false },
    },
  },
  "jee-advanced": {
    id: "jee-advanced",
    track: "jee",
    name: "JEE Advanced",
    short: "Advanced",
    subjects: ["physics", "chemistry", "mathematics"],
    blurb: "The IIT entrance. Fewer questions, deeper problems, multi-correct options with partial marking.",
    pattern: "2 papers · 3 hours each · pattern changes year to year",
    durationMinutes: 180,
    marking: {
      single_correct: { correct: 3, incorrect: -1, unattempted: 0, partial: false },
      multiple_correct: { correct: 4, incorrect: -2, unattempted: 0, partial: true },
      numerical: { correct: 4, incorrect: 0, unattempted: 0, partial: false },
    },
  },
  neet: {
    id: "neet",
    track: "neet",
    name: "NEET UG",
    short: "NEET",
    subjects: ["physics", "chemistry", "biology"],
    blurb: "The national medical entrance. Biology carries half the paper; Physics usually decides the rank.",
    pattern: "180 questions · 3 hours · single-correct MCQs",
    durationMinutes: 180,
    marking: {
      single_correct: { correct: 4, incorrect: -1, unattempted: 0, partial: false },
    },
  },
};

export const EXAM_LIST: ExamConfig[] = [EXAMS["jee-main"], EXAMS["jee-advanced"], EXAMS.neet];

export const TRACK_INFO: Record<Track, { name: string; exams: ExamId[]; subjects: SubjectId[]; primaryExam: ExamId }> = {
  jee: { name: "JEE", exams: ["jee-main", "jee-advanced"], subjects: ["physics", "chemistry", "mathematics"], primaryExam: "jee-main" },
  neet: { name: "NEET", exams: ["neet"], subjects: ["physics", "chemistry", "biology"], primaryExam: "neet" },
};

export function isTrack(v: string): v is Track {
  return v === "jee" || v === "neet";
}

export function trackOf(exam: ExamId): Track {
  return EXAMS[exam].track;
}
