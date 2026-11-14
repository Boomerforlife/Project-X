import type { z } from 'zod';
import type { AiTask } from '../types.js';

export type ModelTier = 'FAST' | 'STRONG';
export interface StructuredRequest<T> {
  task: AiTask;
  tier: ModelTier;
  system: string;
  prompt: string;
  images?: { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; base64: string }[];
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}
export type AiErrorKind = 'SCHEMA_INVALID' | 'TRANSPORT' | 'RATE_LIMITED' | 'SAFETY_BLOCKED' | 'TIMEOUT' | 'BUDGET_EXCEEDED';
export type StructuredResult<T> =
  | { ok: true; value: T; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }
  | {
      ok: false;
      error: { kind: AiErrorKind; message: string; raw?: string };
      model: string;
      usage?: { inputTokens: number; outputTokens: number };
      latencyMs: number;
    };
export interface GeminiClient {
  readonly provider: 'gemini' | 'mock';
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export const RETRYABLE_ERROR_KINDS: readonly AiErrorKind[] = ['TRANSPORT', 'RATE_LIMITED', 'TIMEOUT'];

/** Per-task defaults (AI_PIPELINE section 3). */
export const TASK_DEFAULTS: Record<AiTask, { tier: ModelTier; maxOutputTokens: number; temperature: number }> = {
  CLASSIFY: { tier: 'FAST', maxOutputTokens: 512, temperature: 0 },
  ANSWER: { tier: 'STRONG', maxOutputTokens: 1024, temperature: 0 },
  SOLVE: { tier: 'STRONG', maxOutputTokens: 4096, temperature: 0.2 },
  ALTERNATIVES: { tier: 'STRONG', maxOutputTokens: 3072, temperature: 0.2 },
  CRITIQUE: { tier: 'STRONG', maxOutputTokens: 2048, temperature: 0 },
  QUALITY: { tier: 'FAST', maxOutputTokens: 512, temperature: 0.2 },
  SEO_META: { tier: 'FAST', maxOutputTokens: 512, temperature: 0.2 },
};

export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
