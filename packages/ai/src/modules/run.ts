import type { z } from 'zod';
import type { AiErrorKind, GeminiClient, ModelTier } from '../gemini/client.js';
import { RETRYABLE_ERROR_KINDS, TASK_DEFAULTS } from '../gemini/client.js';
import { costMicros, DEFAULT_MODELS, DEFAULT_PRICING, type PricingTable } from '../gemini/pricing.js';
import type { PromptDef, PromptQuestion } from '../prompts/common.js';
import { toJsonSchema } from '../schemas/json-schema.js';
import type { AiRepository, QuestionAsset, QuestionRecord } from '../repo/types.js';
import type { AiTask } from '../types.js';
import { canonicalJson, sha256Hex } from '../util/hash.js';

export type ImageLoader = (asset: QuestionAsset) => Promise<{ mimeType: QuestionAsset['mimeType']; base64: string } | null>;

export interface ModuleContext {
  client: GeminiClient;
  repo: AiRepository;
  jobId?: string | null;
  imageLoader?: ImageLoader;
  models?: Partial<Record<ModelTier, string>>;
  pricing?: PricingTable;
}

export type TaskResult<T> =
  | { ok: true; value: T; runId: string; reused: boolean }
  | { ok: false; kind: AiErrorKind; message: string; runId: string | null; retryable: boolean };

export interface RunTaskArgs<I, T> {
  ctx: ModuleContext;
  task: AiTask;
  prompt: PromptDef<I>;
  input: I;
  schema: z.ZodType<T>;
  questionId: string;
  solutionVersionId?: string | null;
  /** Extra identity folded into input_hash (e.g. image asset ids). */
  extraHashInputs?: unknown;
  images?: QuestionAsset[];
  tier?: ModelTier;
}

export function toPromptQuestion(q: QuestionRecord): PromptQuestion {
  return {
    questionType: q.questionType,
    text: q.questionText,
    options: [...q.options].sort((a, b) => a.label.localeCompare(b.label)).map((o) => ({ label: o.label, text: o.text })),
  };
}

export async function runTask<I, T>(args: RunTaskArgs<I, T>): Promise<TaskResult<T>> {
  const { ctx, task, prompt, input, schema, questionId } = args;
  const defaults = TASK_DEFAULTS[task];
  const tier = args.tier ?? defaults.tier;
  const models = { ...DEFAULT_MODELS, ...ctx.models };
  const modelName = ctx.client.provider === 'mock' ? 'mock' : models[tier];
  const inputHash = sha256Hex(
    canonicalJson({
      task,
      prompt_id: prompt.id,
      prompt_version: prompt.version,
      model: modelName,
      inputs: input,
      extra: args.extraHashInputs ?? null,
    }),
  );

  const existing = await ctx.repo.findSucceededRun(task, inputHash);
  if (existing) {
    const parsed = schema.safeParse(existing.output);
    if (parsed.success) return { ok: true, value: parsed.data, runId: existing.id, reused: true };
  }

  const images: { mimeType: QuestionAsset['mimeType']; base64: string }[] = [];
  if (ctx.imageLoader) {
    for (const asset of args.images ?? []) {
      const img = await ctx.imageLoader(asset);
      if (img) images.push(img);
    }
  }

  const result = await ctx.client.generateStructured({
    task,
    tier,
    system: prompt.system,
    prompt: prompt.render(input),
    ...(images.length > 0 ? { images } : {}),
    schema,
    jsonSchema: toJsonSchema(schema),
    temperature: defaults.temperature,
    maxOutputTokens: defaults.maxOutputTokens,
  });

  if (!result.ok && result.error.kind === 'BUDGET_EXCEEDED') {
    return { ok: false, kind: 'BUDGET_EXCEEDED', message: result.error.message, runId: null, retryable: false };
  }

  const base = {
    task,
    questionId,
    solutionVersionId: args.solutionVersionId ?? null,
    jobId: ctx.jobId ?? null,
    provider: ctx.client.provider,
    promptId: prompt.id,
    promptVersion: prompt.version,
    inputHash,
  } as const;
  const pricing = ctx.pricing ?? DEFAULT_PRICING;

  if (result.ok) {
    const run = await ctx.repo.insertAiRun({
      ...base,
      model: result.model,
      status: 'SUCCEEDED',
      output: result.value,
      error: null,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsdMicros: costMicros(result.model, result.usage, pricing),
      latencyMs: result.latencyMs,
    });
    return { ok: true, value: result.value, runId: run.id, reused: false };
  }

  const status = result.error.kind === 'SCHEMA_INVALID' ? 'SCHEMA_INVALID' : result.error.kind === 'SAFETY_BLOCKED' ? 'BLOCKED' : 'FAILED';
  const run = await ctx.repo.insertAiRun({
    ...base,
    model: result.model,
    status,
    output: result.error.raw !== undefined ? { raw: result.error.raw } : null,
    error: `${result.error.kind}: ${result.error.message}`.slice(0, 2000),
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    costUsdMicros: costMicros(result.model, result.usage, pricing),
    latencyMs: result.latencyMs,
  });
  return {
    ok: false,
    kind: result.error.kind,
    message: result.error.message,
    runId: run.id,
    retryable: RETRYABLE_ERROR_KINDS.includes(result.error.kind),
  };
}

export function figureAssets(q: QuestionRecord): QuestionAsset[] {
  const ids = new Set(q.referencedAssetIds);
  return q.assets.filter((a) => ids.has(a.id));
}
