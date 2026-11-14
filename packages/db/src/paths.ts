import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (packages/db/src -> ../../..). */
export const repoRoot = path.resolve(here, '..', '..', '..');
export const supabaseDir = path.join(repoRoot, 'supabase');
export const migrationsDir = path.join(supabaseDir, 'migrations');
export const seedDir = path.join(supabaseDir, 'seed');
export const fixturesDir = path.join(supabaseDir, 'fixtures');
export const shimFile = path.join(supabaseDir, 'shim', '00_supabase_shim.sql');
export const defaultPgliteDataDir = path.join(repoRoot, '.local', 'pglite');
export const typesOutputFile = path.join(repoRoot, 'packages', 'database-types', 'src', 'database.ts');
