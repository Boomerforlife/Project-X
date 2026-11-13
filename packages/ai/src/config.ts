import type { ModelTier } from './gemini/client.js';
import { DEFAULT_MODELS } from './gemini/pricing.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AiConfig {
  appEnv: string;
  provider: 'mock' | 'gemini';
  apiKey: string;
  models: Record<ModelTier, string>;
  dailyBudgetUsd: number;
  maxCallsPerRun: number;
  pythonBin: string | undefined;
  sympyTimeoutMs: number;
  dbDriver: 'pglite' | 'postgres';
  databaseUrl: string | undefined;
  dbPoolMax: number;
  /** undefined -> @projectx/db default (<repo>/.local/pglite). */
  pgliteDataDir: string | undefined;
  localStorageDir: string;
}

export interface LoadedConfig {
  config: AiConfig;
  warnings: string[];
}

export interface ConfigOverrides {
  provider?: string | undefined;
  db?: string | undefined;
}

function num(v: string | undefined, fallback: number, name: string): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ConfigError(`${name} must be a non-negative number`);
  return n;
}

/** Env -> config. gemini without a key falls back to mock (WARN); production + mock is refused (AI_PIPELINE section 2). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: ConfigOverrides = {}): LoadedConfig {
  const warnings: string[] = [];
  const appEnv = env.APP_ENV ?? 'development';
  const requested = overrides.provider ?? env.AI_PROVIDER ?? 'mock';
  if (requested !== 'mock' && requested !== 'gemini') throw new ConfigError(`unknown provider: ${requested}`);
  const apiKey = env.GEMINI_API_KEY ?? '';
  let provider: 'mock' | 'gemini' = requested;
  if (provider === 'gemini' && apiKey === '') {
    warnings.push('AI_PROVIDER=gemini but GEMINI_API_KEY is empty: falling back to the mock provider');
    provider = 'mock';
  }
  if (appEnv === 'production' && provider === 'mock') {
    throw new ConfigError('refusing to start: mock AI provider is not allowed when APP_ENV=production');
  }
  const dbDriver = overrides.db ?? env.DB_DRIVER ?? 'pglite';
  if (dbDriver !== 'pglite' && dbDriver !== 'postgres') throw new ConfigError(`unknown db driver: ${dbDriver}`);
  if (dbDriver === 'postgres' && !env.DATABASE_URL) throw new ConfigError('DATABASE_URL is required for --db postgres');
  return {
    warnings,
    config: {
      appEnv,
      provider,
      apiKey,
      models: {
        FAST: env.GEMINI_MODEL_FAST || DEFAULT_MODELS.FAST,
        STRONG: env.GEMINI_MODEL_STRONG || DEFAULT_MODELS.STRONG,
      },
      dailyBudgetUsd: num(env.AI_DAILY_BUDGET_USD, 1, 'AI_DAILY_BUDGET_USD'),
      maxCallsPerRun: num(env.AI_MAX_CALLS_PER_RUN, 200, 'AI_MAX_CALLS_PER_RUN'),
      pythonBin: env.PYTHON_BIN || undefined,
      sympyTimeoutMs: num(env.SYMPY_TIMEOUT_MS, 5000, 'SYMPY_TIMEOUT_MS'),
      dbDriver,
      databaseUrl: env.DATABASE_URL || undefined,
      dbPoolMax: num(env.DB_POOL_MAX, 5, 'DB_POOL_MAX'),
      pgliteDataDir: env.PGLITE_DATA_DIR || undefined,
      localStorageDir: env.LOCAL_STORAGE_DIR || '.local/storage',
    },
  };
}
