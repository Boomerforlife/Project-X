import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

/** Names from the ARCHITECTURE.md section 9 table (first column; handles comma-separated names in one cell). */
function archVarNames(): string[] {
  const md = readFileSync(resolve(root, 'docs/ARCHITECTURE.md'), 'utf8');
  const start = md.indexOf('## 9. Environment variables');
  const next = md.indexOf('\n## ', start + 1);
  const end = next === -1 ? md.length : next;
  expect(start).toBeGreaterThan(-1);
  const names: string[] = [];
  for (const line of md.slice(start, end).split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1] ?? '';
    for (const m of first.matchAll(/`([A-Z][A-Z0-9_]+)`/g)) names.push(m[1]!);
  }
  return names;
}

describe('.env.example', () => {
  const envText = readFileSync(resolve(root, '.env.example'), 'utf8');
  const defined = new Map<string, string>();
  for (const line of envText.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) defined.set(m[1]!, (m[2] ?? '').split(/\s+#/)[0]!.trim());
  }
  it('documents every variable in ARCHITECTURE section 9', () => {
    const names = archVarNames();
    expect(names.length).toBeGreaterThan(30);
    expect(names.filter((n) => !defined.has(n))).toEqual([]);
  });
  it('leaves secrets blank (or dev-only placeholders)', () => {
    for (const k of ['SUPABASE_JWT_SECRET', 'GEMINI_API_KEY']) {
      expect(defined.get(k), k).toBe('');
    }
    for (const k of ['SIGNING_SECRET', 'IP_HASH_SECRET', 'TEST_JWT_SECRET']) expect(defined.get(k), k).toMatch(/^dev-only/);
  });
});
