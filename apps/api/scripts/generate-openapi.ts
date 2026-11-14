import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryRateLimiter, createMemoryStorage, createNoopInvalidator } from '@projectx/edge';
import { createApp } from '../src/app';
import { parseConfig } from '../src/config';
import { silentLogger } from '../src/deps';
import { createMemoryStore, MemoryState } from '../src/repositories/memory/store';

const config = parseConfig({ APP_ENV: 'test', AUTH_MODE: 'test', TEST_JWT_SECRET: 'x'.repeat(32), ENABLE_API_DOCS: 'true' });
const app = createApp({
  config,
  // reason: the OpenAPI document needs no database
  db: {} as never,
  store: createMemoryStore(new MemoryState()),
  storage: { SOURCE_DOCS: createMemoryStorage(), PUBLIC_ASSETS: createMemoryStorage(), USER_UPLOADS: createMemoryStorage() },
  cache: createNoopInvalidator(),
  rateLimiter: createMemoryRateLimiter(),
  auth: { verify: async () => null },
  clock: () => new Date(),
  logger: silentLogger,
  waitUntil: () => undefined,
});
const res = await app.request('/api/v1/openapi.json');
const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'contracts', 'openapi', 'openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`openapi ${doc.openapi}: ${Object.keys(doc.paths).length} paths -> ${out}`);
