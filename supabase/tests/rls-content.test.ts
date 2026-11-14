import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, expectPgError } from './helpers';
import type { TestDb, TestUser } from './helpers';

let db: TestDb;
let user: TestUser;

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  user = await createTestUser(db);
});
afterAll(() => db.close());

/** Tables with no policies and no grants for anon/authenticated. */
const LOCKED_TABLES = [
  'questions', 'question_options', 'question_assets', 'slug_redirects', 'solution_versions', 'sources', 'exam_papers',
  'source_documents', 'source_questions', 'official_answer_keys', 'pipeline_jobs', 'pipeline_job_events', 'ai_runs',
  'verification_runs', 'verification_checks', 'review_events', 'audit_log', 'usage_counters',
];

describe('RLS structure', () => {
  it('RLS is enabled on every table in public', async () => {
    const rows = await asSuperuser<{ relname: string }>(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('locked tables have no table or column privileges for anon/authenticated', async () => {
    const tablePrivs = await asSuperuser<{ grantee: string; table_name: string }>(
      db,
      `select grantee, table_name from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon','authenticated') and table_name = any($1::text[])`,
      [LOCKED_TABLES],
    );
    expect(tablePrivs).toEqual([]);
    const colPrivs = await asSuperuser<{ grantee: string; table_name: string }>(
      db,
      `select grantee, table_name from information_schema.column_privileges
        where table_schema = 'public' and grantee in ('anon','authenticated') and table_name = any($1::text[])`,
      [LOCKED_TABLES],
    );
    expect(colPrivs).toEqual([]);
  });

  it('locked tables have no policies', async () => {
    const rows = await asSuperuser<{ tablename: string }>(
      db,
      `select tablename from pg_policies where schemaname = 'public' and tablename = any($1::text[])`,
      [LOCKED_TABLES],
    );
    expect(rows).toEqual([]);
  });

  it('every policy is scoped to anon/authenticated (never public) and follows the naming scheme', async () => {
    const rows = await asSuperuser<{ policyname: string; tablename: string; cmd: string; roles: string[] }>(
      db,
      `select policyname, tablename, cmd, roles::text[] as roles from pg_policies where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThan(10);
    for (const p of rows) {
      expect(p.roles.every((r) => r === 'anon' || r === 'authenticated'), p.policyname).toBe(true);
      expect(p.policyname).toMatch(new RegExp(`^${p.tablename}_(select|insert|update|delete)_(anon|authenticated)$`));
    }
  });

  it('app_private is not usable by anon, and only is_published_question is executable by authenticated', async () => {
    await expectPgError(db.withAnon((tx) => tx.query(`select app_private.slugify('x')`)), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`select app_private.slugify('x')`)), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`select * from app_private.claim_pipeline_job('w', null)`)), { code: '42501' });
    const ok = await db.withUser(user.claims, (tx) =>
      tx.query<{ r: boolean }>(`select app_private.is_published_question(gen_random_uuid()) as r`),
    );
    expect(ok.rows[0]?.r).toBe(false);
  });
});

describe.each(LOCKED_TABLES)('content table %s is closed to clients', (table) => {
  it('anon SELECT denied (42501)', async () => {
    await expectPgError(db.withAnon((tx) => tx.query(`select * from ${table} limit 1`)), { code: '42501' });
  });
  it('authenticated SELECT denied (42501)', async () => {
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`select * from ${table} limit 1`)), { code: '42501' });
  });
  it('anon and authenticated writes denied (42501)', async () => {
    await expectPgError(db.withAnon((tx) => tx.query(`delete from ${table}`)), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`delete from ${table}`)), { code: '42501' });
    const [col] = await asSuperuser<{ attname: string }>(
      db,
      `select attname from pg_attribute where attrelid = ('public.' || $1)::regclass and attnum > 0 and attidentity = '' order by attnum limit 1`,
      [table],
    );
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`update ${table} set ${col!.attname} = ${col!.attname}`)), { code: '42501' });
  });
});

describe('questions.answer_key and solutions are unreachable', () => {
  it('cannot read answer_key column or count rows as anon/authenticated', async () => {
    await expectPgError(db.withAnon((tx) => tx.query('select answer_key from questions')), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query('select answer_key from questions')), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query('select count(*) from questions')), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query('select final_answer from solution_versions')), { code: '42501' });
  });
  it('the data does exist for the service role (so denial is not a false pass)', async () => {
    const rows = await asSuperuser<{ n: string }>(db, `select count(*) as n from questions where answer_key is not null`);
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(7);
  });
  it('authenticated cannot insert content', async () => {
    await expectPgError(
      db.withUser(user.claims, (tx) =>
        tx.query(`insert into questions (exam_id, origin, question_type, question_text, structured_content) values (gen_random_uuid(), 'EDITORIAL', 'NUMERICAL', 'x', '[]')`),
      ),
      { code: '42501' },
    );
  });
});

describe('taxonomy visibility', () => {
  it('anon sees only active exams', async () => {
    const anon = await db.withAnon((tx) => tx.query<{ slug: string }>('select slug from exams order by slug'));
    expect(anon.rows.map((r) => r.slug)).toEqual(['jee-main']);
    const all = await asSuperuser<{ slug: string; is_active: boolean }>(db, 'select slug, is_active from exams order by slug');
    expect(all.map((r) => r.slug)).toEqual(['jee-advanced', 'jee-main', 'neet-ug']);
    expect(all.filter((r) => r.is_active).map((r) => r.slug)).toEqual(['jee-main']);
  });

  it('subjects/chapters/topics: anon and authenticated see only active rows', async () => {
    await asSuperuser(db, `update chapters set is_active = false where slug = 'jee-main-physics-laws-of-motion'`);
    await asSuperuser(db, `update subjects set is_active = false where slug = 'neet-ug-botany'`);
    await asSuperuser(db, `update topics set is_active = false where slug = 'jee-main-physics-kinematics-motion-graphs'`);

    for (const run of [
      <T>(fn: Parameters<typeof db.withAnon<T>>[0]) => db.withAnon(fn),
      <T>(fn: Parameters<typeof db.withAnon<T>>[0]) => db.withUser(user.claims, fn),
    ]) {
      const ch = await run((tx) => tx.query<{ slug: string }>(`select slug from chapters where slug = 'jee-main-physics-laws-of-motion'`));
      expect(ch.rows).toEqual([]);
      const sub = await run((tx) => tx.query<{ slug: string }>(`select slug from subjects where slug = 'neet-ug-botany'`));
      expect(sub.rows).toEqual([]);
      const top = await run((tx) => tx.query<{ slug: string }>(`select slug from topics where slug = 'jee-main-physics-kinematics-motion-graphs'`));
      expect(top.rows).toEqual([]);
      const active = await run((tx) => tx.query<{ c: string }>(`select count(*) as c from chapters`));
      expect(active.rows[0]?.c).toBe('53');
      const kin = await run((tx) => tx.query<{ c: string }>(`select count(*) as c from topics where slug like 'jee-main-physics-kinematics-%'`));
      expect(kin.rows[0]?.c).toBe('6');
    }
    // still present for the service role
    const raw = await asSuperuser<{ c: string }>(db, `select count(*) as c from chapters`);
    expect(raw[0]?.c).toBe('54');
  });

  it('anon and authenticated cannot modify taxonomy', async () => {
    await expectPgError(db.withAnon((tx) => tx.query(`update exams set is_active = true`)), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`update exams set is_active = true`)), { code: '42501' });
    await expectPgError(db.withUser(user.claims, (tx) => tx.query(`insert into topics (chapter_id, slug, segment, name) values (gen_random_uuid(), 'a', 'a', 'a')`)), { code: '42501' });
    await expectPgError(db.withAnon((tx) => tx.query(`delete from chapters`)), { code: '42501' });
  });

  it('anon has no access to student tables', async () => {
    for (const t of ['profiles', 'bookmarks', 'attempts', 'streaks', 'doubts', 'user_roles', 'goals', 'mistakes']) {
      await expectPgError(db.withAnon((tx) => tx.query(`select * from ${t}`)), { code: '42501' });
    }
  });
});
