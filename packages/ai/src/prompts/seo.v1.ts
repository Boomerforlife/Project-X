import { DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

export interface SeoInput {
  question: PromptQuestion;
  examName: string;
  subjectName: string;
  chapterName: string;
  year: number | null;
}

export const seoPrompt: PromptDef<SeoInput> = {
  id: 'seo_meta',
  version: 'v1',
  system: [
    'You write search-result metadata for a JEE/NEET practice question page.',
    DATA_NOTICE,
    'title: at most 60 characters, specific, no clickbait. description: at most 155 characters, plain text, no LaTeX, no answer reveal.',
    'keywords: at most 8 short phrases. Never fabricate a year, shift or source that is not provided.',
  ].join('\n'),
  render({ question, examName, subjectName, chapterName, year }) {
    return [
      `Exam: ${examName}`,
      `Subject: ${subjectName}`,
      `Chapter: ${chapterName}`,
      `Year: ${year ?? 'unknown'}`,
      renderQuestion(question),
    ].join('\n');
  },
};
