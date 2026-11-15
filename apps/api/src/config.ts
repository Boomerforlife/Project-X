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
  STORAGE_DRIVER: z.enum(['local', 'r2', 'gcs']).default('local'),
  GCS_BUCKET_SOURCE_DOCS: z.string().optional(),
  GCS_BUCKET_PUBLIC_ASSETS: z.string().optional(),
  GCS_BUCKET_USER_UPLOADS: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default('.local/storage'),
  SIGNING_SECRET: z.string().default(''),
  IP_HASH_SECRET: z.string().default(''),
  CACHE_PURGE_DRIVER: z.enum(['noop', 'workers', 'zone_api', 'both']).default('noop'),
  CACHE_MODE: z.enum(['workers', 'cache_api', 'none']).default('none'),
  CF_ZONE_ID: z.string().optional(),
  CF_API_TOKEN_PURGE: z.string().optional(),
  WEB_REVALIDATE_URL: z.string().url().optional(),
  WEB_REVALIDATE_SECRET: z.string().optional(),
  RATE_LIMIT_DRIVER: z.enum(['memory', 'cloudflare', 'noop']).default('memory'),
  API_VERSION: z.string().default('0.1.0'),
  // ---- billing (Tabby Plus, Razorpay one-time Orders). Disabled unless all three Razorpay values are set.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  BILLING_ALLOW_LIVE: bool.default(false),
  FREE_FULL_PAPERS_PER_MONTH: z.coerce.number().int().min(0).max(100).default(2),
  WEB_BASE_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  corsOrigins: string[];
  jwtIssuer: string | null;
  billingEnabled: boolean;
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
  const devLike = c.APP_ENV === 'development' || c.APP_ENV === 'test';
  if (c.AUTH_MODE === 'test' && !devLike) throw new Error('AUTH_MODE=test is only allowed when APP_ENV is development or test');
  if (c.STORAGE_DRIVER !== 'local' || !devLike) {
    for (const k of ['SIGNING_SECRET', 'IP_HASH_SECRET'] as const) {
      if (c[k].length < 32) throw new Error(`${k} (>= 32 chars) is required when STORAGE_DRIVER is r2/gcs or APP_ENV is staging/production`);
    }
  }
  if (c.STORAGE_DRIVER === 'gcs') {
    for (const k of ['GCS_BUCKET_SOURCE_DOCS', 'GCS_BUCKET_PUBLIC_ASSETS', 'GCS_BUCKET_USER_UPLOADS'] as const) {
      if (!c[k]) throw new Error(`${k} is required when STORAGE_DRIVER=gcs`);
    }
  }
  if (c.AUTH_MODE === 'test' && !c.TEST_JWT_SECRET) throw new Error('AUTH_MODE=test requires TEST_JWT_SECRET');
  if (c.AUTH_MODE === 'hs256' && !c.SUPABASE_JWT_SECRET) throw new Error('AUTH_MODE=hs256 requires SUPABASE_JWT_SECRET');
  if (c.AUTH_MODE === 'jwks' && !c.SUPABASE_URL) throw new Error('AUTH_MODE=jwks requires SUPABASE_URL');
  if (c.WEB_REVALIDATE_URL && (c.WEB_REVALIDATE_SECRET ?? '').length < 32) {
    throw new Error('WEB_REVALIDATE_SECRET (>= 32 chars) is required when WEB_REVALIDATE_URL is set');
  }
  const rzp = [c.RAZORPAY_KEY_ID, c.RAZORPAY_KEY_SECRET, c.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length;
  if (rzp !== 0 && rzp !== 3) throw new Error('Billing needs all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET (or none)');
  if (c.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && !c.BILLING_ALLOW_LIVE) {
    throw new Error('Live Razorpay keys are refused unless BILLING_ALLOW_LIVE=true (launch is test mode only)');
  }
  const issuer = c.SUPABASE_JWT_ISSUER ?? (c.SUPABASE_URL ? `${c.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1` : null);
  return {
    ...c,
    corsOrigins: c.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    jwtIssuer: issuer,
    billingEnabled: rzp === 3,
  };
}

/** Secrets are never defaulted in the request path; dev/test entrypoints must supply them explicitly. */
export function requireSecret(config: Pick<AppConfig, 'SIGNING_SECRET' | 'IP_HASH_SECRET'>, name: 'SIGNING_SECRET' | 'IP_HASH_SECRET'): string {
  const v = config[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}
