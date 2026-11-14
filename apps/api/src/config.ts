import { z } from '@hono/zod-openapi';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DB_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  PGLITE_DATA_DIR: z.string().default('.local/pglite'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_JWT_ISSUER: z.string().optional(),
  AUTH_MODE: z.enum(['jwks', 'hs256', 'test']).default('jwks'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  TEST_JWT_SECRET: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  ENABLE_API_DOCS: bool.default(false),
  PUBLIC_ASSETS_BASE_URL: z.string().default('http://localhost:8787/__local/public'),
  FILES_BASE_URL: z.string().default('http://localhost:8787/api/v1/files'),
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.local/storage'),
  SIGNING_SECRET: z.string().default(''),
  IP_HASH_SECRET: z.string().default(''),
  CACHE_PURGE_DRIVER: z.enum(['noop', 'workers', 'zone_api', 'both']).default('noop'),
  CACHE_MODE: z.enum(['workers', 'cache_api', 'none']).default('none'),
  CF_ZONE_ID: z.string().optional(),
  CF_API_TOKEN_PURGE: z.string().optional(),
  RATE_LIMIT_DRIVER: z.enum(['memory', 'cloudflare', 'noop']).default('memory'),
  API_VERSION: z.string().default('0.1.0'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  corsOrigins: string[];
  jwtIssuer: string | null;
};

/** Parse + validate environment. Throws with a readable message on invalid config. */
export function parseConfig(env: Record<string, unknown>): AppConfig {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') clean[k] = v === '' ? undefined : v;
  const parsed = EnvSchema.safeParse(clean);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const c = parsed.data;
  if (c.APP_ENV === 'production' && c.AUTH_MODE === 'test') throw new Error('AUTH_MODE=test is forbidden when APP_ENV=production');
  if (c.APP_ENV === 'production' && (!c.SIGNING_SECRET || !c.IP_HASH_SECRET)) throw new Error('SIGNING_SECRET and IP_HASH_SECRET are required in production');
  if (c.AUTH_MODE === 'test' && !c.TEST_JWT_SECRET) throw new Error('AUTH_MODE=test requires TEST_JWT_SECRET');
  if (c.AUTH_MODE === 'hs256' && !c.SUPABASE_JWT_SECRET) throw new Error('AUTH_MODE=hs256 requires SUPABASE_JWT_SECRET');
  if (c.AUTH_MODE === 'jwks' && !c.SUPABASE_URL) throw new Error('AUTH_MODE=jwks requires SUPABASE_URL');
  const issuer = c.SUPABASE_JWT_ISSUER ?? (c.SUPABASE_URL ? `${c.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1` : null);
  return {
    ...c,
    corsOrigins: c.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    jwtIssuer: issuer,
  };
}
