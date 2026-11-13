import { seoPrompt } from '../prompts/seo.v1.js';
import { SeoOutputSchema, type SeoOutput } from '../schemas/seo.js';
import type { QuestionRecord } from '../repo/types.js';
import { runTask, toPromptQuestion, type ModuleContext, type TaskResult } from './run.js';

export function seo(ctx: ModuleContext, q: QuestionRecord): Promise<TaskResult<SeoOutput>> {
  return runTask({
    ctx,
    task: 'SEO_META',
    prompt: seoPrompt,
    input: {
      question: toPromptQuestion(q),
      examName: q.examName,
      subjectName: q.subjectName ?? 'unknown',
      chapterName: q.chapterName ?? 'unknown',
      year: q.year,
    },
    schema: SeoOutputSchema,
    questionId: q.id,
  });
}
