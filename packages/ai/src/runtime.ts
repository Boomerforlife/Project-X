import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AiConfig } from './config.js';
import { withBudget } from './gemini/budget.js';
import type { GeminiClient } from './gemini/client.js';
import { createGeminiClient } from './gemini/google.js';
import { createMockGeminiClient } from './gemini/mock.js';
import type { ImageLoader } from './modules/run.js';
import type { HandlerDeps } from './pipeline/handlers/common.js';
import type { AiRepository } from './repo/types.js';
import { createPythonSympyChecker } from './verify/sympy.js';
import type { Db } from './types.js';

/** Opens the DB through the documented @projectx/db entrypoints (loaded lazily so unit tests never need a database). */
export async function openDb(config: AiConfig): Promise<Db> {
  if (config.dbDriver === 'pglite') {
    const specifier = '@projectx/db/pglite';
    const mod = (await import(specifier)) as {
      createPgliteDb(o: { dataDir?: string; migrate?: boolean; seed?: boolean; fixtures?: boolean }): Promise<Db>;
    };
    return mod.createPgliteDb({
      ...(config.pgliteDataDir ? { dataDir: config.pgliteDataDir } : {}),
      migrate: true,
      seed: true,
      fixtures: config.appEnv !== 'production',
    });
  }
  const specifier = '@projectx/db/postgres';
  const mod = (await import(specifier)) as {
    createPostgresDb(o: { url: string; max?: number; prepare?: boolean }): Db | Promise<Db>;
  };
  return mod.createPostgresDb({ url: config.databaseUrl ?? '', max: config.dbPoolMax, prepare: false });
}

export function createFsImageLoader(rootDir: string): ImageLoader {
  return async (asset) => {
    try {
      const buf = await readFile(resolve(rootDir, asset.bucket, asset.r2Key));
      return { mimeType: asset.mimeType, base64: buf.toString('base64') };
    } catch {
      return null;
    }
  };
}

export function buildClient(config: AiConfig, repo: AiRepository): GeminiClient & { callsThisRun(): number } {
  const base: GeminiClient =
    config.provider === 'gemini'
      ? createGeminiClient({ apiKey: config.apiKey, models: config.models })
      : createMockGeminiClient({ fixturesDir: resolve(import.meta.dirname, '../fixtures') });
  return withBudget(base, repo, {
    dailyBudgetUsd: config.dailyBudgetUsd,
    maxCallsPerRun: config.maxCallsPerRun,
    models: config.models,
  });
}

export function buildHandlerDeps(config: AiConfig, repo: AiRepository, log: (e: Record<string, unknown>) => void): HandlerDeps {
  return {
    repo,
    client: buildClient(config, repo),
    sympy: createPythonSympyChecker({
      ...(config.pythonBin ? { pythonBin: config.pythonBin } : {}),
      timeoutMs: config.sympyTimeoutMs,
    }),
    imageLoader: createFsImageLoader(config.localStorageDir),
    models: config.models,
    log,
  };
}
