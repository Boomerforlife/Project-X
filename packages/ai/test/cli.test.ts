import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkgDir = resolve(import.meta.dirname, '..');
const tsxCli = resolve(pkgDir, '../../node_modules/tsx/dist/cli.mjs');

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [tsxCli, 'src/cli.ts', ...args], {
    cwd: pkgDir,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, APP_ENV: 'development', PGLITE_DATA_DIR: 'memory://', AI_PROVIDER: 'mock', ...env },
  });
}

describe('CLI (in-memory PGlite, mock provider)', () => {
  it('process-question on the fixture DRAFT question exits 0 and prints the resulting status', () => {
    const r = runCli(['process-question', '--db', 'pglite', '--provider', 'mock', '--id', 'demo-draft-unreviewed-question']);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('verification_status=AUTOMATED_CHECKS_PASSED');
    expect(r.stdout).toContain('"event":"process-question.done"');
  }, 130000);

  it('--dry-run leaves nothing persisted and still reports a status', () => {
    const r = runCli(['process-question', '--dry-run', '--id', 'demo-draft-unreviewed-question']);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toMatch(/verification_status=\w+/);
  }, 130000);

  it('budget command reports spend and exits 0 on an empty day', () => {
    const r = runCli(['budget']);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('"event":"budget"');
  }, 130000);

  it('exit code 2 for configuration errors', () => {
    expect(runCli(['process-question', '--id', 'x'], { APP_ENV: 'production' }).status).toBe(2);
    expect(runCli(['process-question']).status).toBe(2);
    expect(runCli(['nope']).status).toBe(2);
  }, 130000);
});
