import { GoogleGenAI } from '@google/genai';
import type { GeminiClient, ModelTier, StructuredRequest, StructuredResult } from './client.js';
import { formatZodIssues, TASK_DEFAULTS } from './client.js';
import { DEFAULT_MODELS } from './pricing.js';

/** The slice of @google/genai used here; injectable for offline tests. */
export interface GenAiLike {
  models: { generateContent(params: Record<string, unknown>): Promise<GenAiResponse> };
}
export interface GenAiResponse {
  text?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
export interface GoogleClientOptions {
  apiKey: string;
  models?: Partial<Record<ModelTier, string>>;
  genai?: GenAiLike;
  sleep?: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createGeminiClient(opts: GoogleClientOptions): GeminiClient {
  if (process.env.APP_ENV === 'test') {
    throw new Error('createGeminiClient is disabled when APP_ENV=test (no network in tests); use createMockGeminiClient');
  }
  const models = { ...DEFAULT_MODELS, ...opts.models };
  // reason: the SDK class is structurally wider than the slice we use.
  const genai: GenAiLike = opts.genai ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GenAiLike);
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRateLimitRetries ?? 3;

  async function call(
    model: string,
    req: StructuredRequest<unknown>,
    prompt: string,
    timeoutMs: number,
  ): Promise<GenAiResponse> {
    const defaults = TASK_DEFAULTS[req.task];
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    for (const img of req.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          temperature: req.temperature ?? defaults.temperature,
          maxOutputTokens: req.maxOutputTokens ?? defaults.maxOutputTokens,
          abortSignal: controller.signal,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function callWithBackoff(
    model: string,
    req: StructuredRequest<unknown>,
    prompt: string,
    timeoutMs: number,
  ): Promise<GenAiResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call(model, req, prompt, timeoutMs);
      } catch (e) {
        if (isRateLimit(e) && attempt < maxRetries) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw e;
      }
    }
  }

  return {
    provider: 'gemini',
    async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const model = models[req.tier];
      const started = Date.now();
      const timeoutMs = req.timeoutMs ?? 60000;
      const usage = { inputTokens: 0, outputTokens: 0 };
      const elapsed = (): number => Date.now() - started;
      let prompt = req.prompt;
      let lastRaw: string | undefined;
      let lastIssues = '';

      for (let attempt = 0; attempt < 2; attempt++) {
        let res: GenAiResponse;
        try {
          res = await callWithBackoff(model, req as StructuredRequest<unknown>, prompt, timeoutMs);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const kind = isRateLimit(e) ? 'RATE_LIMITED' : isAbort(e) ? 'TIMEOUT' : 'TRANSPORT';
          return { ok: false, error: { kind, message }, model, usage, latencyMs: elapsed() };
        }
        usage.inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
        usage.outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;

        if (res.promptFeedback?.blockReason || res.candidates?.[0]?.finishReason === 'SAFETY') {
          const reason = res.promptFeedback?.blockReason ?? 'SAFETY';
          return { ok: false, error: { kind: 'SAFETY_BLOCKED', message: `blocked: ${reason}` }, model, usage, latencyMs: elapsed() };
        }
        const text = res.text ?? '';
        lastRaw = text;
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          lastIssues = 'response was not valid JSON';
          prompt = repairPrompt(req.prompt, lastIssues);
          continue;
        }
        const check = req.schema.safeParse(parsed);
        if (check.success) return { ok: true, value: check.data, model, usage, latencyMs: elapsed() };
        lastIssues = formatZodIssues(check.error);
        prompt = repairPrompt(req.prompt, lastIssues);
      }
      return {
        ok: false,
        error: { kind: 'SCHEMA_INVALID', message: lastIssues, ...(lastRaw !== undefined ? { raw: lastRaw.slice(0, 4000) } : {}) },
        model,
        usage,
        latencyMs: elapsed(),
      };
    },
  };
}

function repairPrompt(original: string, issues: string): string {
  return `${original}\n\nYour previous response failed validation. Fix these problems and return only the corrected JSON:\n${issues}`;
}

function status(e: unknown): number | undefined {
  if (e && typeof e === 'object') {
    const o = e as { status?: unknown; code?: unknown };
    if (typeof o.status === 'number') return o.status;
    if (typeof o.code === 'number') return o.code;
  }
  return undefined;
}
function isRateLimit(e: unknown): boolean {
  return status(e) === 429;
}
function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /abort|timed? ?out/i.test(e.message));
}
