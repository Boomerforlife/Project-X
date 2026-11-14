import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import {
  AnswerKeySchema,
  AnswerResponseSchema,
  ContentBlockSchema,
  ERROR_HTTP_STATUS,
  ErrorCodeSchema,
  NormalizedQuestionSchema,
  OfficialAnswerSchema,
  PatchMeBody,
  PracticeListQuery,
  QuestionTypeSchema,
  VerificationStatusSchema,
  PublicationStatusSchema,
  CreateSessionBody,
  ExamPreferencesBody,
} from '../src/index';

const U = '11111111-1111-4111-8111-111111111111';
const here = dirname(fileURLToPath(import.meta.url));

describe('enums', () => {
  it('match DATABASE_SCHEMA values', () => {
    expect(QuestionTypeSchema.options).toEqual(['SINGLE_MCQ', 'MULTI_MCQ', 'NUMERICAL']);
    expect(VerificationStatusSchema.options).toHaveLength(6);
    expect(PublicationStatusSchema.options).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
  });
});

describe('errors', () => {
  it('every code has an HTTP status', () => {
    for (const c of ErrorCodeSchema.options) expect(ERROR_HTTP_STATUS[c]).toBeGreaterThan(0);
    expect(ERROR_HTTP_STATUS.MOVED_PERMANENTLY).toBe(301);
    expect(ERROR_HTTP_STATUS.PUBLISH_REQUIREMENTS_NOT_MET).toBe(422);
  });
});

describe('answers', () => {
  it('AnswerResponse enforces uniqueness and decimal format', () => {
    expect(AnswerResponseSchema.safeParse({ type: 'MULTI_MCQ', option_ids: [U, U] }).success).toBe(false);
    expect(AnswerResponseSchema.safeParse({ type: 'NUMERICAL', value: '2.5' }).success).toBe(true);
    expect(AnswerResponseSchema.safeParse({ type: 'NUMERICAL', value: '1e5' }).success).toBe(false);
    expect(AnswerResponseSchema.safeParse({ type: 'NUMERICAL', value: '.5' }).success).toBe(false);
    expect(AnswerResponseSchema.safeParse({ type: 'SINGLE_MCQ', option_id: 'nope' }).success).toBe(false);
  });
  it('AnswerKey / OfficialAnswer shapes', () => {
    expect(
      AnswerKeySchema.safeParse({ type: 'NUMERICAL', accepted_ranges: [{ min: '2.48', max: '2.52' }], display_value: '2.5' }).success,
    ).toBe(true);
    expect(AnswerKeySchema.safeParse({ type: 'SINGLE_MCQ', correct_option_ids: [] }).success).toBe(false);
    expect(OfficialAnswerSchema.safeParse({ kind: 'DROPPED' }).success).toBe(true);
    expect(OfficialAnswerSchema.safeParse({ kind: 'OPTION_LABELS', labels: ['B'] }).success).toBe(true);
  });
});

describe('content blocks', () => {
  it('discriminates on type', () => {
    expect(ContentBlockSchema.safeParse({ type: 'paragraph', text: 'x $a^2$' }).success).toBe(true);
    expect(ContentBlockSchema.safeParse({ type: 'image', asset_id: U, alt: '' }).success).toBe(true);
    expect(ContentBlockSchema.safeParse({ type: 'image', asset_ref: 'q1' }).success).toBe(false);
    expect(ContentBlockSchema.safeParse({ type: 'html', html: '<b>' }).success).toBe(false);
  });
});

describe('ingestion', () => {
  const nq = {
    schema_version: 1,
    question_number: '1',
    external_question_id: null,
    section_hint: 'PHYSICS',
    question_type_guess: 'SINGLE_MCQ',
    content: [
      { type: 'paragraph', text: 'Sample question 1' },
      { type: 'image', asset_ref: 'q1-fig1', alt: '' },
    ],
    options: [{ label: 'A', external_option_id: null, content: [{ type: 'paragraph', text: 'x' }] }],
    assets: [],
    page_start: 1,
    page_end: 1,
    question_text: 'Sample question 1',
    normalized_text: 'sample question 1',
    content_hash: 'a'.repeat(64),
    extraction: { method: 'TEXT', ocr_engine: null, mean_confidence: null, warnings: [] },
  };
  it('accepts a valid NormalizedQuestion and rejects bad hash', () => {
    expect(NormalizedQuestionSchema.safeParse(nq).success).toBe(true);
    expect(NormalizedQuestionSchema.safeParse({ ...nq, content_hash: 'zz' }).success).toBe(false);
    expect(NormalizedQuestionSchema.safeParse({ ...nq, schema_version: 2 }).success).toBe(false);
  });
  it('emitted JSON schema validates required fields', () => {
    const f = join(here, '..', 'json-schema', 'normalized-question.json');
    expect(existsSync(f)).toBe(true);
    const js = JSON.parse(readFileSync(f, 'utf8')) as { required: string[] };
    expect(js.required).toEqual(expect.arrayContaining(['schema_version', 'question_number', 'content', 'options', 'content_hash']));
    // regenerated schema equals committed one
    const regenerated = z.toJSONSchema(NormalizedQuestionSchema, { unrepresentable: 'any', io: 'input' }) as { required: string[] };
    expect(regenerated.required).toEqual(js.required);
  });
});

describe('request schemas', () => {
  it('csv query parsing + defaults', () => {
    const r = PracticeListQuery.parse({ exam: 'jee-main', difficulty: 'EASY,HARD', type: 'NUMERICAL' });
    expect(r.difficulty).toEqual(['EASY', 'HARD']);
    expect(r.limit).toBe(20);
    expect(PracticeListQuery.safeParse({ exam: 'jee-main', difficulty: 'NOPE' }).success).toBe(false);
    expect(PracticeListQuery.safeParse({ exam: 'jee-main', limit: '51' }).success).toBe(false);
  });
  it('PatchMe needs a field; session defaults', () => {
    expect(PatchMeBody.safeParse({}).success).toBe(false);
    expect(PatchMeBody.safeParse({ display_name: 'A' }).success).toBe(true);
    const s = CreateSessionBody.parse({ client_request_id: U, mode: 'MIXED', exam: 'jee-main' });
    expect(s.size).toBe(10);
  });
  it('exam preferences: <=1 primary', () => {
    const p = (a: boolean, b: boolean) => ({ preferences: [{ exam: 'jee-main', is_primary: a }, { exam: 'neet-ug', is_primary: b }] });
    expect(ExamPreferencesBody.safeParse(p(true, false)).success).toBe(true);
    expect(ExamPreferencesBody.safeParse(p(true, true)).success).toBe(false);
  });
});
