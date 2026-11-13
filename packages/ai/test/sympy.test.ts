import { describe, expect, it } from 'vitest';
import { sympyCheck, summariseSympy } from '../src/verify/checks.js';
import { createMockSympyChecker, createPythonSympyChecker, type SympyCheckRequest } from '../src/verify/sympy.js';
import type { SolutionRecord } from '../src/repo/types.js';

function request(id: string, over: Partial<SympyCheckRequest> = {}): SympyCheckRequest {
  return { id, kind: 'NUMERIC_EVAL', expression: '2*3', compare_to: '6', variables: {}, rel_tolerance: 1e-6, ...over };
}

describe('mock checker', () => {
  it('defaults to PASS and honours per-id overrides', async () => {
    const c = createMockSympyChecker({ b: 'FAIL' });
    const r = await c.check([request('a'), request('b')]);
    expect(r.map((x) => x.status)).toEqual(['PASS', 'FAIL']);
  });
});

describe('python bridge (spawns workers/.venv python; offline)', () => {
  const checker = createPythonSympyChecker({ timeoutMs: 20000 });

  it('round-trips PASS / FAIL / ERROR in order', async () => {
    const r = await checker.check([
      request('p', { expression: 'm*g', compare_to: '19.6', variables: { m: '2', g: '9.8' } }),
      request('f', { expression: '2+2', compare_to: '5' }),
      request('e', { expression: "__import__('os')", compare_to: '1' }),
      request('s', { kind: 'SYMBOLIC_EQUIV', expression: '(x+1)^2', compare_to: 'x^2+2*x+1', variables: { x: '2' } }),
    ]);
    expect(r.map((x) => [x.id, x.status])).toEqual([['p', 'PASS'], ['f', 'FAIL'], ['e', 'ERROR'], ['s', 'PASS']]);
  }, 60000);

  it('returns ERROR for every request when the interpreter cannot start', async () => {
    const bad = createPythonSympyChecker({ pythonBin: 'definitely-not-a-python-binary', timeoutMs: 1000 });
    const r = await bad.check([request('a'), request('b')]);
    expect(r.map((x) => x.status)).toEqual(['ERROR', 'ERROR']);
  });

  it('empty batch needs no subprocess', async () => {
    expect(await checker.check([])).toEqual([]);
  });
});

describe('summariseSympy', () => {
  it('maps result sets to check results', () => {
    const r = (status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR') => ({ id: 'x', status, computed: null, message: null });
    expect(summariseSympy([], 0).result).toBe('SKIPPED');
    expect(summariseSympy([r('PASS'), r('PASS')], 2).result).toBe('PASS');
    expect(summariseSympy([r('PASS'), r('FAIL')], 2).result).toBe('FAIL');
    expect(summariseSympy([r('PASS'), r('INCONCLUSIVE')], 2).result).toBe('INCONCLUSIVE');
    expect(summariseSympy([r('ERROR')], 1).result).toBe('INCONCLUSIVE');
  });

  it('a checker that throws yields INCONCLUSIVE', async () => {
    const sol = { sympyChecks: [{ kind: 'NUMERIC_EVAL', expression: '1', compare_to: '1', variables: [] }] } as unknown as SolutionRecord;
    const out = await sympyCheck(sol, { check: () => Promise.reject(new Error('x')) });
    expect(out.result).toBe('INCONCLUSIVE');
  });
});
