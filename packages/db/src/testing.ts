import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { applyShim, listFixtures, listMigrations, listSeeds, loadFixtures, migrate, readShim, seed } from './migrate';
import { openPglite, wrapPglite } from './pglite';
import type { PgliteDb } from './pglite';
import { repoRoot } from './paths';
import type { Db, JwtClaims } from './types';

export type AppRole = 'ADMIN' | 'REVIEWER';
export type TestDb = PgliteDb;

export interface CreateTestDbOptions {
  /** Load supabase/fixtures/*.sql (demo-* questions). Default false. */
  fixtures?: boolean;
}

const templateDir = path.join(repoRoot, '.local', 'test-templates');
const templatePromises = new Map<string, Promise<Blob>>();

async function templateKey(fixtures: boolean): Promise<string> {
  const h = createHash('sha256');
  h.update('pglite-0.5.13\n');
  h.update((await readShim()).sha256);
  for (const f of await listMigrations()) h.update(f.name + f.sha256);
  for (const f of await listSeeds()) h.update(f.name + f.sha256);
  if (fixtures) for (const f of await listFixtures()) h.update(f.name + f.sha256);
  return h.digest('hex').slice(0, 24) + (fixtures ? '-fx' : '');
}

async function buildTemplate(fixtures: boolean): Promise<Blob> {
  const key = await templateKey(fixtures);
  const file = path.join(templateDir, `${key}.tgz`);
  try {
    const bytes = await fs.readFile(file);
    return new Blob([bytes]);
  } catch {
    // build below
  }
  const pg = await openPglite('memory://');
  const db = wrapPglite(pg);
  try {
    await applyShim(db);
    await migrate(db);
    await seed(db);
    if (fixtures) await loadFixtures(db);
    await db.withService((tx) => tx.query('checkpoint'));
    const dump = await pg.dumpDataDir('gzip');
    const buf = Buffer.from(await dump.arrayBuffer());
    await fs.mkdir(templateDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, buf);
    try {
      await fs.rename(tmp, file);
    } catch {
      await fs.rm(tmp, { force: true }); // another process won the race; its file is equivalent
    }
    return new Blob([buf]);
  } finally {
    await pg.close();
  }
}

/**
 * In-memory PGlite with shim + migrations + seeds (+ fixtures) applied, cloned from a cached template
 * (dumpDataDir/loadDataDir). Always `await db.close()` in afterAll or the Node process will not exit.
 */
export async function createTestDb(opts: CreateTestDbOptions = {}): Promise<TestDb> {
  const fixtures = opts.fixtures === true;
  const key = String(fixtures);
  let tpl = templatePromises.get(key);
  if (!tpl) {
    tpl = buildTemplate(fixtures);
    templatePromises.set(key, tpl);
  }
  const blob = await tpl;
  const pg = await openPglite('memory://', blob);
  return wrapPglite(pg);
}

export function claimsFor(id: string, extra: Record<string, unknown> = {}): JwtClaims {
  return { sub: id, role: 'authenticated', ...extra };
}

let userCounter = 0;

export interface TestUser {
  id: string;
  claims: JwtClaims;
}

/** Inserts into auth.users (the handle_new_user trigger creates profile + streak). */
export async function createTestUser(
  db: Db,
  opts: { email?: string; timezone?: string; roles?: AppRole[]; isAnonymous?: boolean; displayName?: string } = {},
): Promise<TestUser> {
  userCounter += 1;
  const email = opts.email ?? `user${userCounter}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const meta: Record<string, string> = {};
  if (opts.timezone) meta.timezone = opts.timezone;
  if (opts.displayName) meta.display_name = opts.displayName;
  const id = await db.withService(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data, is_anonymous) values ($1, $2::jsonb, $3) returning id`,
      [opts.isAnonymous ? null : email, JSON.stringify(meta), opts.isAnonymous === true],
    );
    const uid = r.rows[0]!.id;
    for (const role of opts.roles ?? []) {
      await tx.query(`insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)`, [uid, role]);
    }
    return uid;
  });
  return { id, claims: claimsFor(id, opts.isAnonymous ? { is_anonymous: true } : opts.email ? { email: opts.email } : {}) };
}

/** Run SQL as the connection (owner/superuser) role and return rows. */
export async function asSuperuser<T = Record<string, unknown>>(db: Db, sql: string, params: readonly unknown[] = []): Promise<T[]> {
  return db.withService(async (tx) => (await tx.query<T>(sql, params)).rows);
}
