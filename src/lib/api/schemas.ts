/** Single import point for the DTO schemas/types the web uses. */
export {
  envelope,
  ErrorEnvelopeSchema,
  MeSchema,
  ProgressSchema,
  StreakSchema,
  AttemptHistoryItemSchema,
  BookmarkItemSchema,
  MistakeItemSchema,
  DoubtCreatedSchema,
  PublicQuestionSchema,
  PublicChapterSchema,
  PublicSubjectSchema,
  PublicExamSchema,
  QuestionSummarySchema,
  SitemapEntrySchema,
  TaxonomyExamSchema,
  TaxonomyTreeSchema,
  PracticeQuestionSchema,
  AttemptResultSchema,
  SessionCreatedSchema,
  SessionDetailSchema,
  SessionProgressSchema,
  SessionListItemSchema,
  ActivityDaySchema,
  PatchMeBody,
  ExamPreferencesBody,
  CreateSessionBody,
  SubmitAttemptBody,
  PaperSummarySchema,
  PaperAnalysisSchema,
} from "@projectx/contracts";
import type { z } from "zod";
import type { PatchMeBody as PatchMeBodySchema, ExamPreferencesBody as ExamPrefsSchema, CreateSessionBody as CreateSessionSchema, SubmitAttemptBody as SubmitAttemptSchema } from "@projectx/contracts";

/** Request body types as the client builds them (defaults optional). */
export type PatchMeInput = z.input<typeof PatchMeBodySchema>;
export type ExamPreferencesInput = z.input<typeof ExamPrefsSchema>;
export type CreateSessionInput = z.input<typeof CreateSessionSchema>;
export type SubmitAttemptInput = z.input<typeof SubmitAttemptSchema>;

export type {
  ActivityDay,
  SessionListItem,
  ClassLevel,
  Me,
  Progress,
  Streak,
  AttemptHistoryItem,
  BookmarkItem,
  MistakeItem,
  PublicQuestion,
  PublicChapter,
  PublicSubject,
  PublicExam,
  QuestionSummary,
  SitemapEntry,
  TaxonomyTree,
  TaxonomyExam,
  PracticeQuestion,
  AttemptResult,
  SessionCreated,
  SessionDetail,
  SessionProgress,
  PublicContentBlock,
  PublicSolution,
  AnswerResponse,
  AnswerKeyWithLabels,
  Meta,
  ErrorCode,
  PaperSummary,
  PaperAnalysis,
} from "@projectx/contracts";
