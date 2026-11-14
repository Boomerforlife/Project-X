import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SympyCheckRequest {
  id: string;
  kind: 'NUMERIC_EVAL' | 'SYMBOLIC_EQUIV';
  expression: string;
  compare_to: string;
  variables: Record<string, string>;
  rel_tolerance: number;
}
export interface SympyCheckResult {
  id: string;
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR';
  computed: string | null;
  message: string | null;
}
export interface SympyChecker {
  check(reqs: SympyCheckRequest[]): Promise<SympyCheckResult[]>;
}

export const DEFAULT_REL_TOLERANCE = 1e-6;

export interface PythonSympyOptions {
  pythonBin?: string;
  timeoutMs?: number;
  /** Directory containing the `pxw` package source layout (workers/). Defaults to <repo>/workers. */
  cwd?: string;
}

function defaultWorkersDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../../workers');
}

function venvPython(workersDir: string): string | undefined {
  const candidates = [resolve(workersDir, '.venv/Scripts/python.exe'), resolve(workersDir, '.venv/bin/python')];
  return candidates.find((p) => existsSync(p));
}

/** Spawns `python -m pxw.verification.sympy_check`; any failure (spawn, timeout, bad JSON) yields ERROR for every request. */
export function createPythonSympyChecker(opts: PythonSympyOptions = {}): SympyChecker {
  const timeoutMs = opts.timeoutMs ?? Number(process.env.SYMPY_TIMEOUT_MS ?? 5000);
  const cwd = opts.cwd ?? defaultWorkersDir();
  const pythonBin = opts.pythonBin ?? process.env.PYTHON_BIN ?? venvPython(cwd) ?? 'python';
  return {
    check(reqs) {
      const fail = (message: string): SympyCheckResult[] =>
        reqs.map((r) => ({ id: r.id, status: 'ERROR', computed: null, message }));
      if (reqs.length === 0) return Promise.resolve([]);
      return new Promise((resolvePromise) => {
        let stdout = '';
        let settled = false;
        const done = (v: SympyCheckResult[]): void => {
          if (!settled) {
            settled = true;
            resolvePromise(v);
          }
        };
        const child = spawn(pythonBin, ['-m', 'pxw.verification.sympy_check'], {
          cwd,
          env: {
            ...process.env,
            PYTHONPATH: [resolve(cwd, 'src'), process.env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
            SYMPY_TIMEOUT_MS: String(timeoutMs),
          },
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        // Whole-batch wall clock: slightly above the in-process deadline so Python can report per-item timeouts first.
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          done(fail('sympy subprocess timed out'));
        }, timeoutMs + 3000);
        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString('utf8');
        });
        child.on('error', (e) => {
          clearTimeout(timer);
          done(fail(`sympy subprocess failed to start: ${e.message}`));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) return done(fail(`sympy subprocess exited with code ${String(code)}`));
          try {
            const parsed: unknown = JSON.parse(stdout);
            if (!Array.isArray(parsed) || parsed.length !== reqs.length) return done(fail('sympy subprocess returned malformed output'));
            done(parsed as SympyCheckResult[]);
          } catch {
            done(fail('sympy subprocess returned invalid JSON'));
          }
        });
        child.stdin.on('error', () => undefined);
        child.stdin.end(JSON.stringify(reqs));
      });
    },
  };
}

/** Test double: status per request id (default PASS). */
export function createMockSympyChecker(results: Record<string, SympyCheckResult['status']> = {}): SympyChecker {
  return {
    check(reqs) {
      return Promise.resolve(
        reqs.map((r) => ({
          id: r.id,
          status: results[r.id] ?? 'PASS',
          computed: null,
          message: null,
        })),
      );
    },
  };
}
