import type { ModelTier } from './client.js';

/** USD per 1M tokens. Values are configurable defaults, not authoritative (re-verify at deploy). */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

export const DEFAULT_MODELS: Record<ModelTier, string> = { FAST: 'gemini-3.5-flash-lite', STRONG: 'gemini-3.8-flash' };

export const DEFAULT_PRICING: Record<string, ModelPrice> = {
  'gemini-3.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-3.8-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  mock: { inputPerM: 0, outputPerM: 0 },
};

export type PricingTable = Record<string, ModelPrice>;

/** Unknown model -> STRONG price (never undercount). */
export function priceFor(model: string, table: PricingTable = DEFAULT_PRICING): ModelPrice {
  return table[model] ?? table[DEFAULT_MODELS.STRONG] ?? { inputPerM: 0.3, outputPerM: 2.5 };
}

/** Cost in micro-USD: tokens * (USD per 1M tokens) == micro-USD. */
export function costMicros(
  model: string,
  usage: { inputTokens: number; outputTokens: number } | undefined,
  table: PricingTable = DEFAULT_PRICING,
): number {
  if (!usage) return 0;
  const p = priceFor(model, table);
  return Math.ceil(usage.inputTokens * p.inputPerM + usage.outputTokens * p.outputPerM);
}
