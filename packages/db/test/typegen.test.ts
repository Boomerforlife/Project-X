import fs from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../src/pglite';
import { typesOutputFile } from '../src/paths';
import { generateTypes } from '../src/typegen';

const dbs: { close(): Promise<void> }[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

describe('generateTypes', () => {
  it('is deterministic and matches the committed packages/database-types/src/database.ts', async () => {
    const a = await createPgliteDb({ dataDir: 'memory://', seed: false });
    const b = await createPgliteDb({ dataDir: 'memory://', seed: true });
    dbs.push(a, b);
    const t1 = await generateTypes(a);
    const t2 = await generateTypes(b);
    expect(t2).toBe(t1);
    expect(await fs.readFile(typesOutputFile, 'utf8')).toBe(t1);
  });

  it('emits Supabase-shaped Row/Insert/Update and Enums', async () => {
    const db = await createPgliteDb({ dataDir: 'memory://', seed: false });
    dbs.push(db);
    const t = await generateTypes(db);
    expect(t).toContain('export type Database = {');
    expect(t).toMatch(/questions: \{\s+Row: \{/);
    expect(t).toContain("question_type: 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL'");
    // generated column is in Row but not in Insert/Update
    const q = t.slice(t.indexOf('      questions: {'), t.indexOf('      review_events: {') > 0 ? t.indexOf('      review_events: {') : undefined);
    const [row, insert, update] = [q.indexOf('Row:'), q.indexOf('Insert:'), q.indexOf('Update:')];
    expect(q.slice(row, insert)).toContain('is_indexable: boolean');
    expect(q.slice(insert, update)).not.toContain('is_indexable');
    expect(q.slice(update)).not.toContain('is_indexable');
    // defaults make columns optional on insert; required columns stay required
    expect(q.slice(insert, update)).toMatch(/\n\s+id\?: string/);
    expect(q.slice(insert, update)).toMatch(/\n\s+question_text: string/);
    expect(t).not.toContain('app_private');
    expect(t).not.toContain('local_meta');
  });
});
