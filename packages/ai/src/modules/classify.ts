import { classifyPrompt } from '../prompts/classify.v1.js';
import { ClassificationOutputSchema, type ClassificationOutput } from '../schemas/classification.js';
import type { ClassificationPatch, QuestionRecord, TaxonomyCandidates } from '../repo/types.js';
import { figureAssets, runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

export function classify(
  ctx: ModuleContext,
  q: QuestionRecord,
  taxonomy: TaxonomyCandidates,
): Promise<TaskResult<ClassificationOutput>> {
  return runTask({
    ctx,
    task: 'CLASSIFY',
    prompt: classifyPrompt,
    input: {
      question: toPromptQuestion(q),
      chapters: taxonomy.chapters.map((c) => ({ subjectCode: c.subjectCode, slug: c.slug, name: c.name })),
      topics: taxonomy.topics.map((t) => ({ chapterSlug: t.chapterSlug, slug: t.slug, name: t.name })),
    },
    schema: ClassificationOutputSchema,
    questionId: q.id,
    images: figureAssets(q),
    extraHashInputs: figureAssets(q).map((a) => a.id),
  });
}

export interface ResolvedClassification {
  patch: ClassificationPatch;
  chapterResolved: boolean;
  topicResolved: boolean;
  questionTypeMismatch: boolean;
}

/** Maps AI slugs to ids; unknown slugs resolve to null (never invented). */
export function resolveClassification(
  out: ClassificationOutput,
  taxonomy: TaxonomyCandidates,
  q: Pick<QuestionRecord, 'questionType'>,
): ResolvedClassification {
  const chapter = taxonomy.chapters.find((c) => c.slug === out.chapter_slug) ?? null;
  const topic = chapter && out.topic_slug ? (taxonomy.topics.find((t) => t.slug === out.topic_slug && t.chapterId === chapter.id) ?? null) : null;
  return {
    patch: {
      subjectId: chapter?.subjectId ?? null,
      chapterId: chapter?.id ?? null,
      topicId: topic?.id ?? null,
      difficulty: out.difficulty,
    },
    chapterResolved: chapter !== null,
    topicResolved: topic !== null,
    questionTypeMismatch: out.question_type !== q.questionType,
  };
}
