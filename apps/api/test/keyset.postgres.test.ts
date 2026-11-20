import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPostgresDb } from '@projectx/db/postgres';
import type { Db } from '@projectx/db';
import { Params, keyed, keysetWhere } from '../src/repositories/sql/util';

/**
 * Keyset pagination through the production driver (postgres.js), not PGlite's in-process client.
 * Regression: bulk-published questions share one microsecond `published_at`. Binding the cursor as `$n::timestamptz`
 * let postgres.js serialize it through `Date#toISOString()` (milliseconds), so page 2 skipped the rest of the batch
 * (live: 400 of 433 practice questions reachable).
 */
let pg: PGlite;
let server: PGLiteSocketServer;
let db: Db;

beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(`
    create table t (id uuid primary key, published_at timestamptz not null);
    insert into t
      select gen_random_uuid(), case when g <= 7 then '2026-11-15 19:07:37.066647+00'::timestamptz
                                     else '2026-11-15 19:07:25.266038+00'::timestamptz end
      from generate_series(1, 20) g;`);
  const port = 40000 + Math.floor(Math.random() * 20000);
  server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 1 });
  await server.start();
  db = createPostgresDb({ url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`, max: 1 });
}, 60_000);

afterAll(async () => {
  await db?.close();
  await server?.stop();
  await pg?.close();
});

async function page(after: { k: (string | number | null)[]; id: string } | null, limit: number) {
  return db.withService(async (tx) => {
    const p = new Params();
    const w = keysetWhere(p, after, ['t.published_at'], 't.id', 'desc', ['timestamptz']);
    const r = await tx.query<Record<string, unknown>>(
      `select t.id, t.published_at::text as _k0 from t where ${w} order by t.published_at desc, t.id desc limit ${p.add(limit)}`,
      p.values,
    );
    return keyed(r.rows, 1);
  });
}

describe('keysetWhere over postgres.js', () => {
  it('binds non-text keys as text and casts in SQL', () => {
    const p = new Params();
    expect(keysetWhere(p, { k: ['2026-11-15 19:07:25.266038+00'], id: 'x' }, ['q.published_at'], 'q.id', 'desc', ['timestamptz'])).toBe(
      '(q.published_at, q.id) < ($1::text::timestamptz, $2::uuid)',
    );
    expect(p.values).toEqual(['2026-11-15 19:07:25.266038+00', 'x']);
  });

  it('pages through rows that share a microsecond timestamp without skipping any', async () => {
    const seen: string[] = [];
    let after: { k: (string | number | null)[]; id: string } | null = null;
    for (let i = 0; i < 10; i++) {
      const rows = await page(after, 5);
      if (rows.length === 0) break;
      seen.push(...rows.map((r) => r._id));
      const last = rows[rows.length - 1]!;
      after = { k: last._k, id: last._id };
    }
    expect(seen).toHaveLength(20);
    expect(new Set(seen).size).toBe(20);
  });
});
