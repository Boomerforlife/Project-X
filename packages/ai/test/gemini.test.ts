import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withBudget, METRIC_COST, utcDay, type BudgetStore } from '../src/gemini/budget.js';
import type { GeminiClient, StructuredRequest, StructuredResult } from '../src/gemini/client.js';
import { createGeminiClient, type GenAiLike, type GenAiResponse } from '../src/gemini/google.js';
import { createMockGeminiClient } from '../src/gemini/mock.js';
import { costMicros } from '../src/gemini/pricing.js';
import { AnswerOutputSchema } from '../src/schemas/answer.js';
import { ClassificationOutputSchema } from '../src/schemas/classification.js';
import { CritiqueOutputSchema } from '../src/schemas/critique.js';
import { toJsonSchema } from '../src/schemas/json-schema.js';
import { QualityOutputSchema } from '../src/schemas/quality.js';
import { SeoOutputSchema } from '../src/schemas/seo.js';
import { AlternativesOutputSchema, SolutionOutputSchema } from '../src/schemas/solution.js';
import { MemoryAiRepository } from '../src/repo/memory-repo.js';

const Schema = z.object({ n: z.number(), s: z.string() });
function req(over: Partial<StructuredRequest<{ n: number; s: string }>> = {}): StructuredRequest<{ n: number; s: string }> {
  return { task: 'QUALITY', tier: 'FAST', system: 'sys', prompt: 'prompt', schema: Schema, jsonSchema: toJsonSchema(Schema), ...over };
}

function fakeGenai(responses: (GenAiResponse | Error)[]): GenAiLike & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    models: {
      generateContent(params) {
        calls.push(params);
        const next = responses.shift();
        if (!next) return Promise.reject(new Error('no more responses'));
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      },
    },
  };
}
const text = (t: string, p = 10, c = 5): GenAiResponse => ({ text: t, usageMetadata: { promptTokenCount: p, candidatesTokenCount: c } });

describe('json schema post-processing', () => {
  const schemas = { ClassificationOutputSchema, AnswerOutputSchema, SolutionOutputSchema, AlternativesOutputSchema, CritiqueOutputSchema, QualityOutputSchema, SeoOutputSchema };
  it.each(Object.entries(schemas))('%s uses only the Gemini subset', (_name, schema) => {
    const js = toJsonSchema(schema);
    const text = JSON.stringify(js);
    for (const banned of ['$ref', 'anyOf', 'oneOf', 'maxLength', 'minLength', 'additionalProperties', '$schema', 'format', 'pattern']) {
      expect(text).not.toContain(`"${banned}"`);
    }
    const depth = (n: unknown, d = 0): number => {
      if (Array.isArray(n)) return Math.max(d, ...n.map((x) => depth(x, d)));
      if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        const here = o.type === 'object' || o.type === 'array' ? d + 1 : d;
        return Math.max(here, ...Object.values(o).map((v) => depth(v, here)));
      }
      return d;
    };
    expect(depth(js)).toBeLessThanOrEqual(5);
  });

  it('expresses nullable as a type array and keeps enums', () => {
    const js = toJsonSchema(AnswerOutputSchema) as { properties: { answer: { properties: { value: { type: unknown }; kind: { enum: string[] } } } } };
    expect(js.properties.answer.properties.value.type).toEqual(['string', 'null']);
    expect(js.properties.answer.properties.kind.enum).toEqual(['OPTIONS', 'NUMERIC']);
  });
});

describe('output schemas enforce length limits after the call', () => {
  it('rejects over-long SEO title and rationale', () => {
    expect(SeoOutputSchema.safeParse({ title: 'x'.repeat(61), description: 'd', keywords: [] }).success).toBe(false);
    expect(SeoOutputSchema.safeParse({ title: 'ok', description: 'd'.repeat(156), keywords: [] }).success).toBe(false);
    expect(
      ClassificationOutputSchema.safeParse({ subject_code: 'PHYSICS', chapter_slug: 'c', topic_slug: null, difficulty: 'EASY', question_type: 'SINGLE_MCQ', confidence: 0.5, rationale: 'r'.repeat(301) }).success,
    ).toBe(false);
  });
  it('rejects out-of-range confidence and too many steps', () => {
    expect(AnswerOutputSchema.safeParse({ answer: { kind: 'OPTIONS', labels: ['A'], value: null }, confidence: 1.2, brief_reasoning: '' }).success).toBe(false);
    const step = { title: null, text: 't', display_math: null };
    const base = { answer: { kind: 'OPTIONS', labels: ['A'], value: null }, summary: 's', formulas: [], concepts: [], shortcuts: [], common_mistakes: [], sympy_checks: [] };
    expect(SolutionOutputSchema.safeParse({ ...base, steps: Array(16).fill(step) }).success).toBe(false);
    expect(SolutionOutputSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
    expect(SolutionOutputSchema.safeParse({ ...base, steps: [step] }).success).toBe(true);
  });
});

describe('createGeminiClient', () => {
  const prev = process.env.APP_ENV;
  afterEach(() => {
    if (prev === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prev;
  });

  it('is disabled when APP_ENV=test', () => {
    process.env.APP_ENV = 'test';
    expect(() => createGeminiClient({ apiKey: 'k' })).toThrow(/APP_ENV=test/);
  });

  describe('with an injected transport', () => {
    beforeEach(() => {
      process.env.APP_ENV = 'development';
    });

    it('parses valid JSON and reports usage and model', async () => {
      const genai = fakeGenai([text('{"n":1,"s":"a"}', 12, 7)]);
      const client = createGeminiClient({ apiKey: 'k', genai, models: { FAST: 'fast-m', STRONG: 'strong-m' } });
      const r = await client.generateStructured(req());
      expect(r).toMatchObject({ ok: true, value: { n: 1, s: 'a' }, model: 'fast-m', usage: { inputTokens: 12, outputTokens: 7 } });
      const cfg = (genai.calls[0] as { config: Record<string, unknown> }).config;
      expect(cfg.responseMimeType).toBe('application/json');
      expect(cfg.responseJsonSchema).toBeDefined();
      expect(cfg.systemInstruction).toBe('sys');
    });

    it('repairs once on SCHEMA_INVALID, appending the Zod issues, and sums usage', async () => {
      const genai = fakeGenai([text('{"n":"nope","s":"a"}', 10, 5), text('{"n":2,"s":"b"}', 20, 6)]);
      const client = createGeminiClient({ apiKey: 'k', genai });
      const r = await client.generateStructured(req());
      expect(r.ok).toBe(true);
      expect(genai.calls).toHaveLength(2);
      const secondPrompt = JSON.stringify(genai.calls[1]);
      expect(secondPrompt).toContain('failed validation');
      expect(secondPrompt).toContain('n:');
      if (r.ok) expect(r.usage).toEqual({ inputTokens: 30, outputTokens: 11 });
    });

    it('returns SCHEMA_INVALID after the repair retry also fails (no third call)', async () => {
      const genai = fakeGenai([text('not json'), text('{"n":1}')]);
      const client = createGeminiClient({ apiKey: 'k', genai });
      const r = await client.generateStructured(req());
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('SCHEMA_INVALID');
        expect(r.error.raw).toBe('{"n":1}');
      }
      expect(genai.calls).toHaveLength(2);
    });

    it('backs off 2^n seconds on HTTP 429 (max 3 retries) then succeeds', async () => {
      const rate = Object.assign(new Error('quota'), { status: 429 });
      const genai = fakeGenai([rate, rate, text('{"n":1,"s":"a"}')]);
      const sleeps: number[] = [];
      const client = createGeminiClient({ apiKey: 'k', genai, sleep: (ms) => (sleeps.push(ms), Promise.resolve()) });
      const r = await client.generateStructured(req());
      expect(r.ok).toBe(true);
      expect(sleeps).toEqual([1000, 2000]);
    });

    it('returns RATE_LIMITED after exhausting retries', async () => {
      const rate = Object.assign(new Error('quota'), { status: 429 });
      const genai = fakeGenai([rate, rate, rate, rate]);
      const client = createGeminiClient({ apiKey: 'k', genai, sleep: () => Promise.resolve() });
      const r = await client.generateStructured(req());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('RATE_LIMITED');
      expect(genai.calls).toHaveLength(4);
    });

    it('maps transport errors and safety blocks', async () => {
      const client = createGeminiClient({ apiKey: 'k', genai: fakeGenai([new Error('boom')]) });
      const t = await client.generateStructured(req());
      expect(t.ok === false && t.error.kind).toBe('TRANSPORT');
      const blocked = createGeminiClient({ apiKey: 'k', genai: fakeGenai([{ promptFeedback: { blockReason: 'SAFETY' } }]) });
      const b = await blocked.generateStructured(req());
      expect(b.ok === false && b.error.kind).toBe('SAFETY_BLOCKED');
    });
  });
});

describe('mock client', () => {
  it('uses handlers first and validates their output', async () => {
    const client = createMockGeminiClient({ handlers: { QUALITY: () => ({ n: 3, s: 'h' }) } });
    const r = await client.generateStructured(req());
    expect(r).toMatchObject({ ok: true, value: { n: 3, s: 'h' }, model: 'mock' });
    const bad = createMockGeminiClient({ handlers: { QUALITY: () => ({ n: 'x' }) } });
    const rb = await bad.generateStructured(req());
    expect(rb.ok === false && rb.error.kind).toBe('SCHEMA_INVALID');
  });

  it('estimates usage as chars/4 and is deterministic', async () => {
    const client = createMockGeminiClient({ handlers: { QUALITY: () => ({ n: 1, s: 'a' }) } });
    const a = await client.generateStructured(req({ system: 'x'.repeat(40), prompt: 'y'.repeat(40) }));
    const b = await client.generateStructured(req({ system: 'x'.repeat(40), prompt: 'y'.repeat(40) }));
    expect(a).toEqual(b);
    if (a.ok) expect(a.usage.inputTokens).toBe(20);
  });

  it('default generator output is schema-valid for every task', async () => {
    const q = '<question>\nSynthetic kinematics question\n</question>\nQuestion type: SINGLE_MCQ\nOptions:\nA. one\nB. two\nC. three\nD. four';
    const cls = '- chapter | PHYSICS | jee-main-physics-kinematics | Kinematics\n- topic | jee-main-physics-kinematics | t-slug | T\n';
    const client = createMockGeminiClient();
    const cases: [StructuredRequest<unknown>['task'], z.ZodType<unknown>][] = [
      ['CLASSIFY', ClassificationOutputSchema],
      ['ANSWER', AnswerOutputSchema],
      ['SOLVE', SolutionOutputSchema],
      ['ALTERNATIVES', AlternativesOutputSchema],
      ['CRITIQUE', CritiqueOutputSchema],
      ['QUALITY', QualityOutputSchema],
      ['SEO_META', SeoOutputSchema],
    ];
    for (const [task, schema] of cases) {
      const r = await client.generateStructured({ task, tier: 'FAST', system: 's', prompt: `${cls}${q}`, schema, jsonSchema: {} });
      expect(r.ok, `${task}: ${r.ok ? '' : r.error.message}`).toBe(true);
    }
  });
});

describe('withBudget', () => {
  const okResult = (inTok: number, outTok: number): StructuredResult<unknown> => ({
    ok: true,
    value: {},
    model: 'gemini-3.8-flash',
    usage: { inputTokens: inTok, outputTokens: outTok },
    latencyMs: 1,
  });
  function stub(result: () => StructuredResult<unknown>): GeminiClient & { count: number } {
    return {
      provider: 'gemini',
      count: 0,
      generateStructured<T>(): Promise<StructuredResult<T>> {
        this.count += 1;
        return Promise.resolve(result() as StructuredResult<T>);
      },
    };
  }
  const when = new Date('2026-11-14T10:00:00Z');

  it('records cost and calls, then refuses once the daily cap would be exceeded', async () => {
    const store: BudgetStore = new MemoryAiRepository();
    const inner = stub(() => okResult(1_000_000, 0)); // 0.3 USD at default STRONG price
    const client = withBudget(inner, store, { dailyBudgetUsd: 0.5, maxCallsPerRun: 100, now: () => when });
    const r1 = await client.generateStructured(req({ tier: 'STRONG', maxOutputTokens: 10 }));
    expect(r1.ok).toBe(true);
    expect(await store.getUsage(utcDay(when), METRIC_COST)).toBe(costMicros('gemini-3.8-flash', { inputTokens: 1_000_000, outputTokens: 0 }));
    const r2 = await client.generateStructured(req({ tier: 'STRONG', maxOutputTokens: 10 }));
    expect(r2.ok).toBe(true); // 0.3 spent + tiny estimate < 0.5
    const r3 = await client.generateStructured(req({ tier: 'STRONG', maxOutputTokens: 10 }));
    expect(r3.ok === false && r3.error.kind).toBe('BUDGET_EXCEEDED');
    expect(inner.count).toBe(2);
  });

  it('enforces the per-run call cap', async () => {
    const inner = stub(() => okResult(1, 1));
    const client = withBudget(inner, new MemoryAiRepository(), { dailyBudgetUsd: 100, maxCallsPerRun: 2, now: () => when });
    await client.generateStructured(req());
    await client.generateStructured(req());
    const r = await client.generateStructured(req());
    expect(r.ok === false && r.error.kind).toBe('BUDGET_EXCEEDED');
    expect(r.ok === false && r.error.message).toMatch(/call cap/);
    expect(client.callsThisRun()).toBe(2);
  });

  it('counts a new UTC day separately', async () => {
    const store = new MemoryAiRepository();
    await store.addUsage('2026-11-13', METRIC_COST, 999_999_999);
    const client = withBudget(stub(() => okResult(1, 1)), store, { dailyBudgetUsd: 1, maxCallsPerRun: 10, now: () => when });
    expect((await client.generateStructured(req())).ok).toBe(true);
  });

  it('bills unknown models at the STRONG price', () => {
    expect(costMicros('some-future-model', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(costMicros('gemini-3.8-flash', { inputTokens: 1_000_000, outputTokens: 0 }));
  });
});
