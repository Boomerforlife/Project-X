import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GeminiClient, StructuredRequest, StructuredResult } from './client.js';
import { formatZodIssues } from './client.js';
import { sha256Hex } from '../util/hash.js';
import type { AiTask } from '../types.js';

export interface MockClientOptions {
  fixturesDir?: string;
  handlers?: Partial<Record<AiTask, (req: StructuredRequest<unknown>) => unknown>>;
}

/**
 * Deterministic mock. Output resolution: handlers[task] -> fixtures/<task>/<sha256(prompt)[0..16]>.json -> default generator.
 * The default generator parses the prompts rendered by src/prompts so SOLVE / ANSWER / CRITIQUE agree with each other.
 */
export function createMockGeminiClient(opts: MockClientOptions = {}): GeminiClient {
  return {
    provider: 'mock',
    async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const model = 'mock';
      const inputTokens = Math.ceil((req.system.length + req.prompt.length) / 4);
      let raw: unknown;
      try {
        raw = resolveOutput(req as StructuredRequest<unknown>, opts);
      } catch (e) {
        return {
          ok: false,
          error: { kind: 'TRANSPORT', message: e instanceof Error ? e.message : String(e) },
          model,
          latencyMs: 0,
        };
      }
      const text = JSON.stringify(raw);
      const usage = { inputTokens, outputTokens: Math.ceil(text.length / 4) };
      const parsed = req.schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: { kind: 'SCHEMA_INVALID', message: formatZodIssues(parsed.error), raw: text.slice(0, 4000) },
          model,
          usage,
          latencyMs: 0,
        };
      }
      return { ok: true, value: parsed.data, model, usage, latencyMs: 0 };
    },
  };
}

function resolveOutput(req: StructuredRequest<unknown>, opts: MockClientOptions): unknown {
  const handler = opts.handlers?.[req.task];
  if (handler) return handler(req);
  if (opts.fixturesDir) {
    const file = join(opts.fixturesDir, req.task, `${sha256Hex(req.prompt).slice(0, 16)}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  }
  return defaultOutput(req.task, req.prompt);
}

interface ParsedPrompt {
  stem: string;
  type: string;
  labels: string[];
  official: string | null;
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const stem = /<question>\n([\s\S]*?)\n<\/question>/.exec(prompt)?.[1] ?? '';
  const type = /Question type: (\w+)/.exec(prompt)?.[1] ?? 'SINGLE_MCQ';
  const labels = [...prompt.matchAll(/^([A-E])\. /gm)].map((m) => m[1] as string);
  const official = /The official answer is (.+?)\. Explain/.exec(prompt)?.[1]?.trim() ?? null;
  return { stem, type, labels, official };
}

function hashInt(s: string): number {
  return parseInt(sha256Hex(s).slice(0, 8), 16);
}

function defaultAnswer(p: ParsedPrompt, useOfficial: boolean): { kind: 'OPTIONS' | 'NUMERIC'; labels: string[]; value: string | null } {
  if (p.type === 'NUMERICAL' || p.labels.length === 0) {
    const value = useOfficial && p.official ? p.official : String((hashInt(p.stem) % 9) + 1);
    return { kind: 'NUMERIC', labels: [], value };
  }
  if (useOfficial && p.official) {
    return { kind: 'OPTIONS', labels: p.official.split(/[,\s]+/).filter((x) => x.length > 0), value: null };
  }
  const n = p.labels.length;
  const first = hashInt(p.stem) % n;
  const picked = p.type === 'MULTI_MCQ' && n > 1 ? [first, (first + 1) % n] : [first];
  const labels = [...new Set(picked)].sort((a, b) => a - b).map((i) => p.labels[i] as string);
  return { kind: 'OPTIONS', labels, value: null };
}

function defaultOutput(task: AiTask, prompt: string): unknown {
  const p = parsePrompt(prompt);
  switch (task) {
    case 'CLASSIFY': {
      const chapters = [...prompt.matchAll(/^- chapter \| (\w+) \| ([^|]+) \| (.+)$/gm)].map((m) => ({
        subject: (m[1] ?? '').trim(),
        slug: (m[2] ?? '').trim(),
        name: (m[3] ?? '').trim(),
      }));
      const words = new Set(p.stem.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      let best = chapters[0];
      let bestScore = -1;
      for (const c of chapters) {
        const score = (c.name.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length;
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }
      if (!best) throw new Error('mock CLASSIFY: no candidate chapters in prompt');
      const topic = [...prompt.matchAll(/^- topic \| ([^|]+) \| ([^|]+) \| (.+)$/gm)].find((m) => (m[1] ?? '').trim() === best?.slug);
      return {
        subject_code: best.subject,
        chapter_slug: best.slug,
        topic_slug: topic ? (topic[2] ?? '').trim() : null,
        difficulty: 'MEDIUM',
        question_type: p.type,
        confidence: 0.9,
        rationale: 'Mock classification by keyword overlap.',
      };
    }
    case 'ANSWER':
      return { answer: defaultAnswer(p, false), confidence: 0.9, brief_reasoning: 'Mock blind answer.' };
    case 'SOLVE':
      return {
        answer: defaultAnswer(p, true),
        summary: 'Mock solution summary.',
        steps: [
          { title: 'Setup', text: 'Identify the given quantities and the relevant principle.', display_math: null },
          { title: 'Solve', text: 'Apply the principle and simplify to reach the answer.', display_math: 'x = 1' },
        ],
        formulas: [],
        concepts: ['mock concept'],
        shortcuts: [],
        common_mistakes: [],
        sympy_checks: [],
      };
    case 'ALTERNATIVES':
      return { alternatives: [] };
    case 'CRITIQUE':
      return { verdict: 'CORRECT', recomputed_answer: defaultAnswer(p, false), issues: [] };
    case 'QUALITY':
      return { is_complete: true, is_ambiguous: false, ocr_errors_suspected: false, missing_figure: false, issues: [] };
    case 'SEO_META': {
      const flat = p.stem.replace(/\s+/g, ' ').trim();
      return {
        title: flat.slice(0, 57) + (flat.length > 57 ? '...' : '') || 'Practice question',
        description: (flat.slice(0, 140) || 'Practice question') + '.',
        keywords: ['jee', 'practice'],
      };
    }
  }
}
