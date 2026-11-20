import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyShim, listMigrations, migrate, migrationStatus, MigrationChecksumError } from '../src/index';
import { openPglite, wrapPglite } from '../src/pglite';
import type { PgliteDb } from '../src/pglite';

describe('listMigrations', () => {
  it('lists 0001..0028 in order with sha256 checksums', async () => {
    const files = await listMigrations();
    expect(files.map((f) => f.name)).toEqual([
      '0001_extensions_helpers.sql', '0002_enums.sql', '0003_taxonomy.sql', '0004_provenance.sql', '0005_questions.sql',
      '0006_solutions.sql', '0007_pipeline.sql', '0008_verification.sql', '0009_users.sql', '0010_practice.sql',
      '0011_doubts_uploads.sql', '0012_rls_and_grants.sql', '0013_publication_guard.sql', '0014_publication_guard_hardening.sql', '0015_profile_class_level_session_ui.sql', '0016_pin_helper_search_path.sql', '0017_shared_rate_limits.sql', '0018_billing.sql', '0019_analytics.sql', '0020_publish_ai_checked.sql', '0021_ai_checked_practice_only.sql', '0022_problem_families.sql', '0023_problem_title_cleanup.sql', '0024_study_plans.sql', '0025_link_keys_clears_stale_official.sql', '0026_classification_rewards_billing_fixes.sql', '0027_official_pyq_without_ai.sql', '0028_paper_only_chapters.sql',
    ]);
    for (const f of files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('migrations avoid post-PG15 features and manage no transactions themselves', async () => {
    for (const f of await listMigrations()) {
      expect(f.sql, f.name).not.toMatch(/uuidv7|\bMERGE\b|JSON_TABLE/i);
      expect(f.sql, f.name).not.toMatch(/^\s*(begin|commit)\s*;/im);
    }
  });
});

describe('migrate', () => {
  let db: PgliteDb;
  let tmp: string;
  beforeAll(async () => {
    db = wrapPglite(await openPglite('memory://'));
    await applyShim(db);
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'px-mig-'));
    await fs.writeFile(path.join(tmp, '0001_a.sql'), 'create table t_a (id int);\n');
    await fs.writeFile(path.join(tmp, '0002_b.sql'), 'create table t_b (id int);\ninsert into t_b values (1);\n');
  });
  afterAll(async () => {
    await db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reports pending, applies in order, tracks checksums, and is idempotent', async () => {
    expect((await migrationStatus(db, { dir: tmp })).map((s) => s.state)).toEqual(['pending', 'pending']);
    const first = await migrate(db, { dir: tmp });
    expect(first).toEqual({ applied: ['0001_a.sql', '0002_b.sql'], skipped: [] });
    const second = await migrate(db, { dir: tmp });
    expect(second).toEqual({ applied: [], skipped: ['0001_a.sql', '0002_b.sql'] });
    const rows = await db.withService((tx) => tx.query<{ name: string; sha256: string }>('select name, sha256 from local_meta.applied_migrations order by name'));
    expect(rows.rows.map((r) => r.name)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(rows.rows.every((r) => /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
    expect((await migrationStatus(db, { dir: tmp })).map((s) => s.state)).toEqual(['applied', 'applied']);
  });

  it('applies new files later and refuses a modified applied migration', async () => {
    await fs.writeFile(path.join(tmp, '0003_c.sql'), 'create table t_c (id int);\n');
    expect((await migrate(db, { dir: tmp })).applied).toEqual(['0003_c.sql']);
    await fs.appendFile(path.join(tmp, '0001_a.sql'), '-- tampered\n');
    await expect(migrate(db, { dir: tmp })).rejects.toBeInstanceOf(MigrationChecksumError);
    expect((await migrationStatus(db, { dir: tmp })).map((s) => s.state)).toEqual(['changed', 'applied', 'applied']);
  });

  it('rolls back a failing migration file entirely and does not record it', async () => {
    await fs.writeFile(path.join(tmp, '0001_a.sql'), 'create table t_a (id int);\n'); // restore original
    await fs.writeFile(path.join(tmp, '0004_bad.sql'), 'create table t_d (id int);\nselect * from does_not_exist;\n');
    await expect(migrate(db, { dir: tmp })).rejects.toThrow();
    const r = await db.withService((tx) => tx.query<{ ok: boolean }>(`select to_regclass('t_d') is not null as ok`));
    expect(r.rows[0]?.ok).toBe(false);
    const names = await db.withService((tx) => tx.query<{ name: string }>('select name from local_meta.applied_migrations'));
    expect(names.rows.map((x) => x.name)).not.toContain('0004_bad.sql');
  });
});
