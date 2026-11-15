/**
 * Production Node entry (Google Cloud Run / any container host). No dev defaults: everything comes from the environment.
 * Cloud Run provides PORT and Application Default Credentials (used by the GCS client).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { serve } from '@hono/node-server';
import { Storage } from '@google-cloud/storage';
import { createPostgresDb } from '@projectx/db/postgres';
import { createMemoryRateLimiter, createNoopInvalidator, createWebhookInvalidator, type CacheInvalidator, type StorageSet } from '@projectx/edge';
import { createGcsStorage, createLocalStorage } from '@projectx/edge/node';
import { createApp } from './app';
import { createAuthVerifier } from './auth/verifier';
import { parseConfig } from './config';
import { createConsoleLogger } from './deps';
import { createPostgresRateLimiter } from './lib/pg-rate-limit';

const config = parseConfig(process.env);
if (config.APP_ENV !== 'staging' && config.APP_ENV !== 'production') {
  throw new Error('server.ts is the deployed entry: set APP_ENV=staging|production (use `npm run dev -w @projectx/api` locally)');
}
if (config.DB_DRIVER !== 'postgres' || !config.DATABASE_URL) throw new Error('server.ts requires DB_DRIVER=postgres and DATABASE_URL');

const db = createPostgresDb({ url: config.DATABASE_URL, max: config.DB_POOL_MAX });

function buildStorage(): StorageSet {
  if (config.STORAGE_DRIVER === 'gcs') {
    const gcs = new Storage();
    return {
      SOURCE_DOCS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_SOURCE_DOCS!)),
      PUBLIC_ASSETS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_PUBLIC_ASSETS!)),
      USER_UPLOADS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_USER_UPLOADS!)),
    };
  }
  if (config.STORAGE_DRIVER === 'local') {
    return {
      SOURCE_DOCS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'SOURCE_DOCS'),
      PUBLIC_ASSETS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'PUBLIC_ASSETS'),
      USER_UPLOADS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'USER_UPLOADS'),
    };
  }
  throw new Error(`server.ts does not support STORAGE_DRIVER=${config.STORAGE_DRIVER} (use gcs)`);
}

// No CDN purge on Google Cloud: only the web app's revalidation webhook (B7).
function buildInvalidator(): CacheInvalidator {
  if (config.WEB_REVALIDATE_URL && config.WEB_REVALIDATE_SECRET) {
    return createWebhookInvalidator({ url: config.WEB_REVALIDATE_URL, secret: config.WEB_REVALIDATE_SECRET });
  }
  return createNoopInvalidator();
}

const logger = createConsoleLogger(config.LOG_LEVEL);
const requestTasks = new AsyncLocalStorage<Promise<unknown>[]>();
const api = createApp({
  config,
  db,
  storage: buildStorage(),
  cache: buildInvalidator(),
  // Sensitive classes (writes, attempts, doubts, admin) share one Postgres counter across all instances;
  // high-volume public reads stay in memory per instance.
  rateLimiter: createPostgresRateLimiter(db, createMemoryRateLimiter(), {
    onError: (err) => logger.warn('shared rate limiter unavailable; allowing request', { error: String(err) }),
  }),
  auth: createAuthVerifier(config),
  clock: () => new Date(),
  logger,
  // Cloud Run throttles CPU once a response is sent, so "after the response" work could stall. Instead, each request
  // collects its background tasks and the response is released only after they settle (see fetchWithTasks below).
  waitUntil: (p) => {
    const tasks = requestTasks.getStore();
    const guarded = p.catch((err: unknown) => logger.warn('background task failed', { error: String(err) }));
    if (tasks) tasks.push(guarded);
    else void guarded;
  },
});

const port = Number(process.env['PORT'] ?? 8080);
/** Run the request, then wait for any waitUntil() work (bounded: purge/webhook calls have their own timeouts). */
async function fetchWithTasks(req: Request): Promise<Response> {
  const tasks: Promise<unknown>[] = [];
  return requestTasks.run(tasks, async () => {
    const res = await api.fetch(req);
    if (tasks.length) await Promise.allSettled(tasks);
    return res;
  });
}

const server = serve({ fetch: fetchWithTasks, port, hostname: '0.0.0.0' }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'api listening', port: info.port, env: config.APP_ENV, storage: config.STORAGE_DRIVER }));
});

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
});
