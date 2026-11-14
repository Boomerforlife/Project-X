import type { ExecutionContext } from '@cloudflare/workers-types';
import { createPostgresDb } from '@projectx/db/postgres';
import {
  createCloudflareRateLimiter,
  createCompositeInvalidator,
  createMemoryRateLimiter,
  createNoopInvalidator,
  createNoopRateLimiter,
  createR2Storage,
  createWorkersCacheInvalidator,
  createZoneApiInvalidator,
  type CacheInvalidator,
  type RateLimiter,
} from '@projectx/edge';
import { createApp } from './app';
import { createAuthVerifier } from './auth/verifier';
import { parseConfig } from './config';
import { createConsoleLogger, type AppDeps } from './deps';
import type { Env } from './env';

function buildInvalidator(config: AppDeps['config']): CacheInvalidator {
  const list: CacheInvalidator[] = [];
  if (config.CACHE_PURGE_DRIVER === 'workers' || config.CACHE_PURGE_DRIVER === 'both') {
    list.push(
      createWorkersCacheInvalidator({
        purge: async (o) => {
          // reason: Workers Caching purge API is not in workers-types yet; feature-detected at runtime
          const c = (globalThis as unknown as { cache?: { purge(o: { tags: string[] }): Promise<unknown> } }).cache;
          if (!c) throw new Error('Workers Caching purge API unavailable in this runtime');
          return c.purge(o);
        },
      }),
    );
  }
  if ((config.CACHE_PURGE_DRIVER === 'zone_api' || config.CACHE_PURGE_DRIVER === 'both') && config.CF_ZONE_ID && config.CF_API_TOKEN_PURGE) {
    list.push(createZoneApiInvalidator({ zoneId: config.CF_ZONE_ID, apiToken: config.CF_API_TOKEN_PURGE }));
  }
  return list.length ? createCompositeInvalidator(list) : createNoopInvalidator();
}

let memoryLimiter: RateLimiter | undefined;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const config = parseConfig(env as Record<string, unknown>);
    const url = env.HYPERDRIVE?.connectionString ?? (typeof env['DATABASE_URL'] === 'string' ? env['DATABASE_URL'] : '');
    const db = createPostgresDb({ url, max: 1, prepare: false });
    const rateLimiter =
      config.RATE_LIMIT_DRIVER === 'cloudflare'
        ? createCloudflareRateLimiter({
            RL_PUBLIC: env.RL_PUBLIC,
            RL_SEARCH: env.RL_SEARCH,
            RL_WRITE: env.RL_WRITE,
            RL_ATTEMPTS: env.RL_ATTEMPTS,
            RL_DOUBTS: env.RL_DOUBTS,
            RL_ADMIN: env.RL_ADMIN,
          })
        : config.RATE_LIMIT_DRIVER === 'noop'
          ? createNoopRateLimiter()
          : (memoryLimiter ??= createMemoryRateLimiter());
    const deps: AppDeps = {
      config,
      db,
      storage: {
        SOURCE_DOCS: createR2Storage(env.SOURCE_DOCS),
        PUBLIC_ASSETS: createR2Storage(env.PUBLIC_ASSETS),
        USER_UPLOADS: createR2Storage(env.USER_UPLOADS),
      },
      cache: buildInvalidator(config),
      rateLimiter,
      auth: createAuthVerifier(config),
      clock: () => new Date(),
      logger: createConsoleLogger(config.LOG_LEVEL),
      waitUntil: (p) => ctx.waitUntil(p),
    };
    const app = createApp(deps);
    try {
      return await app.fetch(request, env, ctx);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
};
