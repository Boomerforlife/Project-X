import { parseArgs } from 'node:util';
import { createPostgresDb } from '../postgres';
import { createPgliteDb } from '../pglite';
import { applyShim, loadFixtures, migrate, migrationStatus, seed } from '../migrate';
import { defaultPgliteDataDir } from '../paths';
import type { Db } from '../types';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    status: { type: 'boolean', default: false },
    shim: { type: 'boolean', default: false },
    seed: { type: 'boolean', default: false },
    fixtures: { type: 'boolean', default: false },
    dir: { type: 'string' },
    'data-dir': { type: 'string' },
  },
});

let db: Db;
if (values.url) {
  db = createPostgresDb({ url: values.url, max: 1 });
} else {
  // migrate:false so that --status never mutates; we run the steps ourselves below
  db = await createPgliteDb({ dataDir: values['data-dir'] ?? process.env.PGLITE_DATA_DIR ?? defaultPgliteDataDir, migrate: false });
}

let exitCode = 0;
try {
  const opts = values.dir ? { dir: values.dir } : {};
  if (values.status) {
    const rows = await migrationStatus(db, opts);
    for (const r of rows) console.log(`${r.state.padEnd(8)} ${r.name}`);
    const pending = rows.filter((r) => r.state !== 'applied').length;
    console.log(`${rows.length - pending} applied, ${pending} pending/changed`);
    if (pending > 0) exitCode = 1;
  } else {
    // pglite (no --url) always needs the shim; plain Postgres only when --shim is given (never on real Supabase)
    if (!values.url || values.shim) {
      const applied = await applyShim(db);
      if (applied) console.log('applied supabase shim');
    }
    const res = await migrate(db, opts);
    for (const n of res.applied) console.log(`applied  ${n}`);
    for (const n of res.skipped) console.log(`skipped  ${n}`);
    if (values.seed) console.log(`seeded   ${(await seed(db)).join(', ')}`);
    if (values.fixtures) console.log(`fixtures ${(await loadFixtures(db)).join(', ')}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  exitCode = 1;
} finally {
  await db.close();
}
process.exit(exitCode);
