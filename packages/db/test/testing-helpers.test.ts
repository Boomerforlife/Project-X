import { afterAll, describe, expect, it } from 'vitest';
import { asSuperuser, claimsFor, createTestDb, createTestUser } from '../src/testing';

const dbs: { close(): Promise<void> }[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

describe('createTestDb', () => {
  it('clones are isolated from each other and from the template', async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    dbs.push(a, b);
    await asSuperuser(a, `update exams set name = 'changed' where slug = 'jee-main'`);
    expect((await asSuperuser<{ name: string }>(a, `select name from exams where slug = 'jee-main'`))[0]?.name).toBe('changed');
    expect((await asSuperuser<{ name: string }>(b, `select name from exams where slug = 'jee-main'`))[0]?.name).toBe('JEE Main');
    const c = await createTestDb();
    dbs.push(c);
    expect((await asSuperuser<{ name: string }>(c, `select name from exams where slug = 'jee-main'`))[0]?.name).toBe('JEE Main');
  });

  it('fixtures option loads the demo questions only when requested', async () => {
    const plain = await createTestDb();
    const fx = await createTestDb({ fixtures: true });
    dbs.push(plain, fx);
    expect((await asSuperuser<{ n: string }>(plain, `select count(*) n from questions`))[0]?.n).toBe('0');
    expect((await asSuperuser<{ n: string }>(fx, `select count(*) n from questions where slug like 'demo-%'`))[0]?.n).toBe('8');
  });
});

describe('createTestUser / claimsFor', () => {
  it('creates auth user + profile + streak, with timezone, roles and claims', async () => {
    const db = await createTestDb();
    dbs.push(db);
    const u = await createTestUser(db, { timezone: 'America/New_York', roles: ['ADMIN', 'REVIEWER'], email: 'a@b.test' });
    expect(u.claims).toEqual({ sub: u.id, role: 'authenticated', email: 'a@b.test' });
    expect(claimsFor(u.id)).toEqual({ sub: u.id, role: 'authenticated' });
    const rows = await asSuperuser<{ timezone: string; roles: string[] }>(
      db,
      `select p.timezone, array(select role::text from user_roles where user_id = p.id order by role) roles from profiles p where p.id = $1`,
      [u.id],
    );
    expect(rows[0]).toEqual({ timezone: 'America/New_York', roles: ['ADMIN', 'REVIEWER'] });
    expect(await asSuperuser(db, `select 1 from streaks where user_id = $1`, [u.id])).toHaveLength(1);
  });
});
