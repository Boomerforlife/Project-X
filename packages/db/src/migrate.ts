import type { Db, SqlTx } from './types';

// NOTE: node:* modules and ./paths.ts are imported lazily so that importing '@projectx/db' from a Worker bundle
// never touches the filesystem at module load.

export interface SqlFile {
  name: string;
  path: string;
  sql: string;
  sha256: string;
}

export interface MigrateOptions {
  /** Directory holding NNNN_name.sql files (default: <repo>/supabase/migrations). */
  dir?: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export interface MigrationStatus {
  name: string;
  sha256: string;
  state: 'applied' | 'pending' | 'changed';
}

export class MigrationChecksumError extends Error {
  constructor(
    readonly migration: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Migration ${migration} was modified after being applied (applied sha256 ${expected}, file sha256 ${actual})`);
    this.name = 'MigrationChecksumError';
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads *.sql files from a directory, sorted lexicographically. */
export async function readSqlDir(dir: string): Promise<SqlFile[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.sql'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  names.sort();
  const out: SqlFile[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const sql = (await fs.readFile(full, 'utf8')).replace(/\r\n/g, '\n');
    out.push({ name, path: full, sql, sha256: await sha256Hex(sql) });
  }
  return out;
}

export async function listMigrations(dir?: string): Promise<SqlFile[]> {
  const { migrationsDir } = await import('./paths');
  return readSqlDir(dir ?? migrationsDir);
}

export async function listSeeds(dir?: string): Promise<SqlFile[]> {
  const { seedDir } = await import('./paths');
  return readSqlDir(dir ?? seedDir);
}

export async function listFixtures(dir?: string): Promise<SqlFile[]> {
  const { fixturesDir } = await import('./paths');
  return readSqlDir(dir ?? fixturesDir);
}

export async function readShim(): Promise<SqlFile> {
  const { shimFile } = await import('./paths');
  const fs = await import('node:fs/promises');
  const sql = (await fs.readFile(shimFile, 'utf8')).replace(/\r\n/g, '\n');
  return { name: '00_supabase_shim.sql', path: shimFile, sql, sha256: await sha256Hex(sql) };
}

export async function execScript(tx: SqlTx, sql: string): Promise<void> {
  if (tx.exec) {
    await tx.exec(sql);
  } else {
    await tx.query(sql);
  }
}

/** True when the Supabase shim (auth schema + roles) is already present. */
export async function isShimApplied(db: Db): Promise<boolean> {
  return db.withService(async (tx) => {
    const r = await tx.query<{ ok: boolean }>(
      `select (to_regnamespace('auth') is not null and exists (select 1 from pg_roles where rolname = 'authenticated')) as ok`,
    );
    return r.rows[0]?.ok === true;
  });
}

/** Applies supabase/shim/00_supabase_shim.sql once (test/local databases only; never real Supabase). */
export async function applyShim(db: Db): Promise<boolean> {
  if (await isShimApplied(db)) return false;
  const shim = await readShim();
  await db.withService((tx) => execScript(tx, shim.sql));
  return true;
}

async function ensureMetaTable(db: Db): Promise<void> {
  await db.withService((tx) =>
    execScript(
      tx,
      `create schema if not exists local_meta;
       create table if not exists local_meta.applied_migrations (
         name text primary key,
         sha256 text not null,
         applied_at timestamptz not null default now()
       );`,
    ),
  );
}

/** Applied-vs-pending report (does not modify anything except creating local_meta when missing is NOT done). */
export async function migrationStatus(db: Db, opts: MigrateOptions = {}): Promise<MigrationStatus[]> {
  const files = await listMigrations(opts.dir);
  const applied = new Map<string, string>();
  await db.withService(async (tx) => {
    const has = await tx.query<{ ok: boolean }>(`select to_regclass('local_meta.applied_migrations') is not null as ok`);
    if (has.rows[0]?.ok) {
      const rows = await tx.query<{ name: string; sha256: string }>(`select name, sha256 from local_meta.applied_migrations`);
      for (const r of rows.rows) applied.set(r.name, r.sha256);
    }
  });
  return files.map((f) => {
    const prev = applied.get(f.name);
    return { name: f.name, sha256: f.sha256, state: prev === undefined ? 'pending' : prev === f.sha256 ? 'applied' : 'changed' };
  });
}

/**
 * Applies pending migrations in lexicographic order, one transaction per file.
 * Tracks applied files in local_meta.applied_migrations(name, sha256, applied_at); refuses changed checksums.
 */
export async function migrate(db: Db, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const files = await listMigrations(opts.dir);
  await ensureMetaTable(db);
  const result: MigrateResult = { applied: [], skipped: [] };
  for (const file of files) {
    const outcome = await db.withService(async (tx) => {
      const prev = await tx.query<{ sha256: string }>(`select sha256 from local_meta.applied_migrations where name = $1`, [file.name]);
      const row = prev.rows[0];
      if (row) {
        if (row.sha256 !== file.sha256) throw new MigrationChecksumError(file.name, row.sha256, file.sha256);
        return 'skipped' as const;
      }
      await execScript(tx, file.sql);
      await tx.query(`insert into local_meta.applied_migrations (name, sha256) values ($1, $2)`, [file.name, file.sha256]);
      return 'applied' as const;
    });
    result[outcome].push(file.name);
  }
  return result;
}

/** Runs every seed file (idempotent SQL; not tracked). */
export async function seed(db: Db, opts: { dir?: string } = {}): Promise<string[]> {
  const files = await listSeeds(opts.dir);
  for (const f of files) {
    await db.withService((tx) => execScript(tx, f.sql));
  }
  return files.map((f) => f.name);
}

/** Runs dev-only fixtures (supabase/fixtures/*.sql; idempotent; never in production). */
export async function loadFixtures(db: Db, opts: { dir?: string } = {}): Promise<string[]> {
  const files = await listFixtures(opts.dir);
  for (const f of files) {
    await db.withService((tx) => execScript(tx, f.sql));
  }
  return files.map((f) => f.name);
}
