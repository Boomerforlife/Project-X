import type { GeminiClient, ModelTier, StructuredRequest, StructuredResult } from './client.js';
import { TASK_DEFAULTS } from './client.js';
import { costMicros, DEFAULT_MODELS, DEFAULT_PRICING, type PricingTable } from './pricing.js';

export const METRIC_COST = 'ai.cost_usd_micros';
export const METRIC_CALLS = 'ai.calls';

export interface BudgetStore {
  getUsage(day: string, metric: string): Promise<number>;
  addUsage(day: string, metric: string, delta: number): Promise<void>;
}
export interface BudgetOptions {
  dailyBudgetUsd: number;
  maxCallsPerRun: number;
  models?: Partial<Record<ModelTier, string>>;
  pricing?: PricingTable;
  now?: () => Date;
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nextUtcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

export function withBudget(
  client: GeminiClient,
  store: BudgetStore,
  opts: BudgetOptions,
): GeminiClient & { callsThisRun(): number } {
  const models = { ...DEFAULT_MODELS, ...opts.models };
  const pricing = opts.pricing ?? DEFAULT_PRICING;
  const now = opts.now ?? ((): Date => new Date());
  const capMicros = Math.round(opts.dailyBudgetUsd * 1_000_000);
  let calls = 0;

  return {
    provider: client.provider,
    callsThisRun: () => calls,
    async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const model = models[req.tier];
      const day = utcDay(now());
      const refuse = (message: string): StructuredResult<T> => ({
        ok: false,
        error: { kind: 'BUDGET_EXCEEDED', message },
        model,
        latencyMs: 0,
      });
      if (calls >= opts.maxCallsPerRun) return refuse(`per-run call cap reached (${opts.maxCallsPerRun})`);
      const spent = await store.getUsage(day, METRIC_COST);
      // The mock provider is free; estimate with the tier's configured model price regardless.
      const estimate = client.provider === 'mock'
        ? 0
        : costMicros(
            model,
            {
              inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4),
              outputTokens: req.maxOutputTokens ?? TASK_DEFAULTS[req.task].maxOutputTokens,
            },
            pricing,
          );
      if (spent + estimate > capMicros) return refuse(`daily budget exceeded (${spent}+${estimate} > ${capMicros} micro-USD)`);

      calls += 1;
      const result = await client.generateStructured(req);
      const actual = costMicros(result.model, result.ok ? result.usage : result.usage, pricing);
      if (actual > 0) await store.addUsage(day, METRIC_COST, actual);
      await store.addUsage(day, METRIC_CALLS, 1);
      return result;
    },
  };
}
