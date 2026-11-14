import net from 'node:net';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDb } from '../src/postgres';
import { claimsFor, createTestDb, createTestUser } from '../src/testing';
import type { Db } from '../src/types';
import type { TestDb } from '../src/testing';

/** Exercises the postgres.js executor (the one the Worker uses) against an in-process PG wire server. */
let pgl: TestDb;
let server: PGLiteSocketServer;
let db: Db;
let userId: string;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

beforeAll(async () => {
  pgl = await createTestDb({ fixtures: true });
  const u = await createTestUser(pgl);
  userId = u.id;
  const port = await freePort();
  server = new PGLiteSocketServer({ db: pgl.pg, port, host: '127.0.0.1', maxConnections: 1 });
  await server.start();
  db = createPostgresDb({ url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`, max: 1 });
});
afterAll(async () => {
  await db.close();
  await server.stop();
  await pgl.close();
});

describe('createPostgresDb (postgres.js) against the PGlite wire server', () => {
  it('withService runs queries with $n params and returns rows/rowCount', async () => {
    const r = await db.withService((tx) => tx.query<{ n: number; s: string }>('select $1::int as n, $2::text as s', [7, 'x']));
    expect(r.rows).toEqual([{ n: 7, s: 'x' }]);
    expect(r.rowCount).toBe(1);
  });

  it('jsonb params round-trip as JSON.stringify(...)::jsonb; arrays map to uuid[]', async () => {
    const r = await db.withService((tx) =>
      tx.query<{ j: { a: number[] }; ids: string[] }>(`select $1::jsonb as j, $2::uuid[] as ids`, [JSON.stringify({ a: [1, 2] }), ['11111111-1111-4111-8111-111111111111']]),
    );
    expect(r.rows[0]?.j).toEqual({ a: [1, 2] });
    expect(r.rows[0]?.ids).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('types: timestamptz -> Date, int8 and numeric -> string, date selectable as text', async () => {
    const r = await db.withService((tx) =>
      tx.query<{ t: Date; c: string; n: string; d: string }>(`select now() as t, count(*) as c, 4.50::numeric(5,2) as n, date '2026-01-02'::text as d from exams`),
    );
    expect(r.rows[0]?.t).toBeInstanceOf(Date);
    expect(r.rows[0]?.c).toBe('3');
    expect(r.rows[0]?.n).toBe('4.50');
    expect(r.rows[0]?.d).toBe('2026-01-02');
  });

  it('withAnon sets the anon role: taxonomy visible, content denied (42501)', async () => {
    const ex = await db.withAnon((tx) => tx.query<{ slug: string }>('select slug from exams'));
    expect(ex.rows.map((x) => x.slug)).toEqual(['jee-main']);
    await expect(db.withAnon((tx) => tx.query('select * from questions'))).rejects.toMatchObject({ code: '42501' });
    const role = await db.withAnon((tx) => tx.query<{ r: string }>('select current_user as r'));
    expect(role.rows[0]?.r).toBe('anon');
  });

  it('withUser sets claims + authenticated role; RLS scopes rows to auth.uid()', async () => {
    const r = await db.withUser(claimsFor(userId), (tx) => tx.query<{ id: string; who: string; me: string }>('select id, current_user as who, auth.uid()::text as me from profiles'));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: userId, who: 'authenticated', me: userId });
    await expect(db.withUser(claimsFor(userId), (tx) => tx.query('select * from questions'))).rejects.toMatchObject({ code: '42501' });
  });

  it('role and claims do not leak between transactions (SET LOCAL)', async () => {
    await db.withUser(claimsFor(userId), (tx) => tx.query('select 1'));
    const r = await db.withService((tx) => tx.query<{ who: string; claims: string | null }>(`select current_user as who, nullif(current_setting('request.jwt.claims', true), '') as claims`));
    expect(r.rows[0]?.who).toBe('postgres');
    expect(r.rows[0]?.claims).toBeNull();
  });

  it('rolls back the whole unit on error', async () => {
    await expect(
      db.withService(async (tx) => {
        await tx.query(`insert into usage_counters (day, metric, value) values (current_date, 'rollback.test', 1)`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const r = await db.withService((tx) => tx.query(`select 1 from usage_counters where metric = 'rollback.test'`));
    expect(r.rows).toHaveLength(0);
  });

  it('exec runs multi-statement scripts', async () => {
    await db.withService(async (tx) => {
      await tx.exec?.(`create temp table t_exec (a int); insert into t_exec values (1), (2);`);
      const r = await tx.query<{ n: string }>('select count(*) as n from t_exec');
      expect(r.rows[0]?.n).toBe('2');
    });
  });

  it('surfaces SQLSTATE on constraint violations', async () => {
    await expect(db.withService((tx) => tx.query(`insert into exams (code, slug, name, short_name) values ('X', 'Bad Slug', 'n', 's')`))).rejects.toMatchObject({ code: '23514' });
  });
});
