import type { SubjectId } from "@/contracts";

/** Visual metadata only — subject data itself comes from the data layer. */
export const SUBJECT_STYLE: Record<SubjectId, { text: string; bg: string; border: string; glyph: string; cssVar: string }> = {
  physics: { text: "text-physics", bg: "bg-physics", border: "border-physics", glyph: "Φ", cssVar: "var(--physics)" },
  chemistry: { text: "text-chemistry", bg: "bg-chemistry", border: "border-chemistry", glyph: "⌬", cssVar: "var(--chemistry)" },
  mathematics: { text: "text-mathematics", bg: "bg-mathematics", border: "border-mathematics", glyph: "∫", cssVar: "var(--mathematics)" },
  biology: { text: "text-biology", bg: "bg-biology", border: "border-biology", glyph: "✿", cssVar: "var(--biology)" },
};

export const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export const QUESTION_TYPE_LABEL = {
  single_correct: "Single correct",
  multiple_correct: "Multiple correct",
  numerical: "Numerical",
} as const;
