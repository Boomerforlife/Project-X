import type { AttemptMode, ExamId, MarkingScheme, Response, SubjectId } from "@/contracts";

export type ClassLevel = "11" | "12" | "dropper";

export type CosmeticId = "glasses" | "scarf" | "bowtie" | "crown";

export type DemoUser = {
  name: string;
  exam: ExamId;
  classLevel: ClassLevel;
  /** Questions per day. */
  dailyGoal: number;
  onboarded: boolean;
  joinedAt: string;
  showOnLeaderboard: boolean;
  cosmetic: CosmeticId | null;
};

export type AttemptSection = { id: string; name: string; subject: SubjectId; questionIds: string[]; marking: MarkingScheme };

export type Attempt = {
  id: string;
  exam: ExamId;
  mode: AttemptMode;
  kind: "practice" | "paper";
  title: string;
  paperId?: string;
  /** Set when this attempt retries an earlier one. The original is never modified. */
  retryOf?: string;
  scope?: { subject?: SubjectId; chapter?: string; source?: "quick" | "chapter" | "subject" | "mistakes" | "bookmarks" | "review" | "single" };
  questionIds: string[];
  sections: AttemptSection[];
  durationSec: number | null;
  startedAt: string;
  updatedAt: string;
  submittedAt: string | null;
  status: "in_progress" | "submitted";
  current: number;
  elapsedSec: number;
  responses: Record<string, Response>;
  /**
   * API mode only: true for attempts that live in this browser (flagged paper
   * demo). Everything else is a server session and is graded by the server.
   */
  local?: boolean;
};

export const MISTAKE_CATEGORIES = [
  { id: "concept", label: "Conceptual gap" },
  { id: "calculation", label: "Calculation error" },
  { id: "formula", label: "Formula recall" },
  { id: "misread", label: "Misread question" },
  { id: "time", label: "Time pressure" },
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number]["id"];

export type MistakeRecord = {
  questionId: string;
  attemptId: string;
  at: string;
  category: MistakeCategory | null;
  status: "open" | "resolved";
  resolvedAt: string | null;
  reattempts: number;
};

export type DayActivity = { answered: number; correct: number; xp: number; seconds: number; subjects: Partial<Record<SubjectId, number>> };

export type DemoState = {
  v: 2;
  user: DemoUser | null;
  attempts: Record<string, Attempt>;
  bookmarks: Record<string, string>;
  review: Record<string, string>;
  mistakes: Record<string, MistakeRecord>;
  /** Keyed by local date YYYY-MM-DD. */
  activity: Record<string, DayActivity>;
  /** API mode only: server-owned progress that the local rules cannot derive. */
  server?: {
    streak: { current: number; longest: number; todayAttempts: number; goalMetToday: boolean } | null;
    /** subject/chapter -> answered/correct, from GET /users/me/progress. */
    chapters: { subject: SubjectId; chapter: string; answered: number; correct: number }[];
    subjects: { subject: SubjectId; answered: number; correct: number }[];
    weak: { subject: SubjectId; chapter: string; answered: number; accuracy: number }[];
  };
};
