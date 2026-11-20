/**
 * Chapter classification with Claude, cross-checked by the keyword rules (owner decision 2026-11-20).
 *
 * Claude reads a previous-year question (its extracted text, and the question image when it is public) and picks one
 * chapter from the subject's syllabus list; structured output restricts the answer to that list. The keyword rules
 * (chapter-keywords.ts) then check it: a question is moved to the chapter only when both agree, or when Claude is
 * sure and the keyword rules found too little to have an opinion. Anything else is left for a person.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CONFIDENCE, type ChapterGuess } from './chapter-keywords';

export const CLASSIFIER_MODEL = 'claude-opus-5-5';

export type AiChapter = { chapter: string; confidence: 'high' | 'medium' | 'low' };
export type Decision = { action: 'assign'; chapter: string; why: string } | { action: 'review'; why: string };

export type ChapterOption = { segment: string; name: string };

export function systemPrompt(exam: string, subject: string, chapters: ChapterOption[]): string {
  return [
    `You sort ${exam} ${subject} questions into the official syllabus chapter they test.`,
    'Pick the single chapter whose concepts a student must use to solve the question. When a question spans chapters,',
    'pick the one its final step depends on. Only use chapter ids from this list:',
    ...chapters.map((c) => `- ${c.segment}: ${c.name}`),
    'The question text was extracted from an image and can contain OCR errors; the image, when given, is authoritative.',
    'Set confidence to "high" only when the chapter is clear, "medium" when two chapters are plausible, "low" otherwise.',
  ].join('\n');
}

export function outputSchema(chapters: ChapterOption[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      chapter: { type: 'string', enum: chapters.map((c) => c.segment) },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['chapter', 'confidence'],
    additionalProperties: false,
  };
}

/** One batch request. `custom_id` is the question id. */
export function buildRequest(q: { id: string; text: string; imageUrl: string | null }, system: string, schema: Record<string, unknown>): Anthropic.Messages.Batches.BatchCreateParams.Request {
  const content: Anthropic.ContentBlockParam[] = [];
  if (q.imageUrl) content.push({ type: 'image', source: { type: 'url', url: q.imageUrl } });
  content.push({ type: 'text', text: `Question (extracted text):\n${q.text.slice(0, 4000)}` });
  return {
    custom_id: q.id,
    params: {
      model: CLASSIFIER_MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    },
  };
}

/** Reads the structured answer from a finished message; null when the model refused or the JSON is unusable. */
export function parseAnswer(message: Anthropic.Message, known: Set<string>): AiChapter | null {
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') return null;
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    const v = JSON.parse(text) as Partial<AiChapter>;
    if (typeof v.chapter !== 'string' || !known.has(v.chapter)) return null;
    if (v.confidence !== 'high' && v.confidence !== 'medium' && v.confidence !== 'low') return null;
    return { chapter: v.chapter, confidence: v.confidence };
  } catch {
    return null;
  }
}

/** The cross-check. `kw` is the keyword rules' guess for the same question (usually not confident: that is why it is here). */
export function decide(ai: AiChapter | null, kw: ChapterGuess): Decision {
  if (!ai) return { action: 'review', why: 'no usable answer from Claude' };
  if (kw.chapter === ai.chapter && ai.confidence !== 'low') return { action: 'assign', chapter: ai.chapter, why: 'claude and keywords agree' };
  if (ai.confidence === 'high' && kw.score < CONFIDENCE.minScore) {
    return { action: 'assign', chapter: ai.chapter, why: 'claude sure, keywords too weak to disagree' };
  }
  return { action: 'review', why: kw.chapter ? `claude ${ai.chapter} (${ai.confidence}) vs keywords ${kw.chapter} (${kw.score})` : `claude ${ai.confidence}` };
}
