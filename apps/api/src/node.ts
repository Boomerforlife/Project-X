import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createPgliteDb } from '@projectx/db/pglite';
import { createPostgresDb } from '@projectx/db/postgres';
import type { Db } from '@projectx/db';
import { createMemoryRateLimiter, createNoopInvalidator, type StorageSet } from '@projectx/edge';
import { createLocalStorage } from '@projectx/edge/node';
import { createApp } from './app';
import { createAuthVerifier } from './auth/verifier';
import { parseConfig } from './config';
import { createConsoleLogger } from './deps';

const env: Record<string, unknown> = {
  APP_ENV: 'development',
  AUTH_MODE: 'test',
  TEST_JWT_SECRET: 'dev-test-secret-change-me-32-chars-min',
  SIGNING_SECRET: 'dev-only-signing-secret-not-for-prod-0123456789',
  IP_HASH_SECRET: 'dev-only-ip-hash-secret-not-for-prod-0123456789',
  ENABLE_API_DOCS: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  ...process.env,
};
const config = parseConfig(env);

let db: Db;
if (config.DB_DRIVER === 'postgres') {
  if (!config.DATABASE_URL) throw new Error('DB_DRIVER=postgres requires DATABASE_URL');
  db = createPostgresDb({ url: config.DATABASE_URL, max: config.DB_POOL_MAX });
} else {
  db = await createPgliteDb({ dataDir: config.PGLITE_DATA_DIR, migrate: true, seed: true, fixtures: config.APP_ENV !== 'production' });
}

const storage: StorageSet = {
  SOURCE_DOCS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'SOURCE_DOCS'),
  PUBLIC_ASSETS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'PUBLIC_ASSETS'),
  USER_UPLOADS: createLocalStorage(config.LOCAL_STORAGE_DIR, 'USER_UPLOADS'),
};

const api = createApp({
  config,
  db,
  storage,
  cache: createNoopInvalidator(),
  rateLimiter: createMemoryRateLimiter(),
  auth: createAuthVerifier(config),
  clock: () => new Date(),
  logger: createConsoleLogger(config.LOG_LEVEL),
  waitUntil: (p) => void p.catch(() => undefined),
});

const outer = new Hono();
outer.get('/__local/public/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/__local/public/', ''));
  try {
    const obj = await storage.PUBLIC_ASSETS.get(key);
    if (!obj) return c.text('not found', 404);
    return new Response(obj.body, { headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return c.text('not found', 404);
  }
});
outer.route('/', api);

const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: outer.fetch, port }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'api listening', port: info.port, db: config.DB_DRIVER }));
});
