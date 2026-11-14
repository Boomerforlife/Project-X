import { DATA_NOTICE, renderQuestion, type PromptDef, type PromptQuestion } from './common.js';

export interface ClassifyInput {
  question: PromptQuestion;
  chapters: { subjectCode: string; slug: string; name: string }[];
  topics: { chapterSlug: string; slug: string; name: string }[];
}

export const classifyPrompt: PromptDef<ClassifyInput> = {
  id: 'classify',
  version: 'v1',
  system: [
    'You classify JEE/NEET exam questions into a fixed taxonomy.',
    DATA_NOTICE,
    'Choose subject_code, chapter_slug and topic_slug ONLY from the candidate lists provided; topic_slug may be null.',
    'difficulty is relative to JEE Main: EASY (single concept), MEDIUM (two concepts), HARD (multi-step).',
    'question_type must be SINGLE_MCQ, MULTI_MCQ or NUMERICAL based on the format shown.',
    'confidence is your calibrated probability (0..1) that chapter_slug is right. rationale is at most 300 characters.',
  ].join('\n'),
  render(input) {
    const lines = ['# Candidate chapters (subject | slug | name)'];
    for (const c of input.chapters) lines.push(`- chapter | ${c.subjectCode} | ${c.slug} | ${c.name}`);
    lines.push('# Candidate topics (chapter slug | slug | name)');
    for (const t of input.topics) lines.push(`- topic | ${t.chapterSlug} | ${t.slug} | ${t.name}`);
    lines.push('# Question', renderQuestion(input.question));
    return lines.join('\n');
  },
};
