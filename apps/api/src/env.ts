import type { R2Bucket } from '@cloudflare/workers-types';

type RateBinding = { limit(o: { key: string }): Promise<{ success: boolean }> };

/** Cloudflare Worker bindings + vars (names fixed by docs/ARCHITECTURE.md section 9). */
export interface Env {
  SOURCE_DOCS: R2Bucket;
  PUBLIC_ASSETS: R2Bucket;
  USER_UPLOADS: R2Bucket;
  RL_PUBLIC: RateBinding;
  RL_SEARCH: RateBinding;
  RL_WRITE: RateBinding;
  RL_ATTEMPTS: RateBinding;
  RL_DOUBTS: RateBinding;
  RL_ADMIN: RateBinding;
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
}
