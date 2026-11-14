import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { ANON_CLAIMS_JSON, userClaimsJson } from './types';
import type { Db, JwtClaims, SqlTx } from './types';
import { applyShim, loadFixtures, migrate, seed } from './migrate';
import { defaultPgliteDataDir } from './paths';

export interface PgliteDbOptions {
  /** Directory, or 'memory://'. Default: <repo>/.local/pglite (env PGLITE_DATA_DIR overrides when unset). */
  dataDir?: string | 'memory://';
  /** Apply shim + pending migrations (default true). */
  migrate?: boolean;
  /** Run seed files (default true when migrate is true). */
  seed?: boolean;
  /** Run dev fixtures (default false). */
  fixtures?: boolean;
  /** Restore a database from a dumpDataDir() blob (used by @projectx/db/testing). */
  loadDataDir?: Blob;
}

export type PgliteDb = Db & { readonly pg: PGlite };

// PGlite parses int8 into number when safe; postgres.js returns strings. Align on strings for cross-driver parity.
const INT8 = 20;
const parsers = { [INT8]: (v: string) => v };

export async function openPglite(dataDir: string | undefined, loadDataDir?: Blob): Promise<PGlite> {
  const options = { extensions: { pg_trgm }, parsers, ...(loadDataDir ? { loadDataDir } : {}) };
  return dataDir ? PGlite.create(dataDir, options) : PGlite.create(options);
}

function wrapTx(tx: Pick<PGlite, 'query' | 'exec'>): SqlTx {
  return {
    async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      // reason: PGlite accepts any[] params; readonly guards callers only.
      const res = await tx.query<T>(text, params as unknown[]);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(text: string) {
      await tx.exec(text);
    },
  };
}

export function wrapPglite(pg: PGlite): PgliteDb {
  return {
    pg,
    withService: (fn) => pg.transaction((tx) => fn(wrapTx(tx))),
    withUser: (claims: JwtClaims, fn) =>
      pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [userClaimsJson(claims)]);
        await tx.exec('set local role authenticated');
        return fn(wrapTx(tx));
      }),
    withAnon: (fn) =>
      pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [ANON_CLAIMS_JSON]);
        await tx.exec('set local role anon');
        return fn(wrapTx(tx));
      }),
    close: () => pg.close(),
  };
}

export async function createPgliteDb(opts: PgliteDbOptions = {}): Promise<PgliteDb> {
  const dataDir = opts.dataDir ?? process.env.PGLITE_DATA_DIR ?? defaultPgliteDataDir;
  if (dataDir !== 'memory://' && !dataDir.startsWith('idb://')) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(path.resolve(dataDir)), { recursive: true });
  }
  const pg = await openPglite(dataDir, opts.loadDataDir);
  const db = wrapPglite(pg);
  try {
    if (opts.migrate !== false) {
      await applyShim(db);
      await migrate(db);
      if (opts.seed !== false) await seed(db);
      if (opts.fixtures) await loadFixtures(db);
    }
  } catch (err) {
    await pg.close();
    throw err;
  }
  return db;
}
