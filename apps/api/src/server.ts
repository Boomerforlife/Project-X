/**
 * Production Node entry (Google Cloud Run / any container host). No dev defaults: everything comes from the environment.
 * Cloud Run provides PORT and Application Default Credentials (used by the GCS client).
 */
import { serve } from '@hono/node-server';
import { Storage } from '@google-cloud/storage';
import { createPostgresDb } from '@projectx/db/postgres';
import { createMemoryRateLimiter, createNoopInvalidator, createWebhookInvalidator, type CacheInvalidator, type StorageSet } from '@projectx/edge';
import { createGcsStorage, createLocalStorage } from '@projectx/edge/node';
import { createApp } from './app';
import { createAuthVerifier } from './auth/verifier';
import { parseConfig } from './config';
import { createConsoleLogger } from './deps';

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
const api = createApp({
  config,
  db,
  storage: buildStorage(),
  cache: buildInvalidator(),
  rateLimiter: createMemoryRateLimiter(), // per instance; move to Cloud Armor / Redis only if abuse appears
  auth: createAuthVerifier(config),
  clock: () => new Date(),
  logger,
  waitUntil: (p) => void p.catch((err: unknown) => logger.warn('background task failed', { error: String(err) })),
});

const port = Number(process.env['PORT'] ?? 8080);
const server = serve({ fetch: api.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'api listening', port: info.port, env: config.APP_ENV, storage: config.STORAGE_DRIVER }));
});

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
});
