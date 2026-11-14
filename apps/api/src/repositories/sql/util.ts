import type { SqlTx } from '@projectx/db';
import type { Keyed, PageCursor } from '../types';

export type Tx = SqlTx;

/** JSON-encode a list of ids/strings for `$n::jsonb` (portable across postgres.js and PGlite). */
export const jsonList = (xs: readonly string[]): string => JSON.stringify(xs);
/** SQL fragment: uuid set from a jsonb array parameter. */
export const uuidSet = (n: number): string => `(select value::uuid from jsonb_array_elements_text($${n}::jsonb))`;
export const textSet = (n: number): string => `(select value from jsonb_array_elements_text($${n}::jsonb))`;
/** SQL fragment: text[] from a jsonb array parameter. */
export const textArray = (n: number): string => `array(select jsonb_array_elements_text($${n}::jsonb))`;

/** Collects positional params and returns `$n` placeholders. */
export class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
  get next(): number {
    return this.values.length + 1;
  }
}

/** Strip `_k0.._kN` columns into `_k` and expose `_id`. */
export function keyed<T extends Record<string, unknown>>(rows: T[], nKeys: number, idCol = 'id'): Keyed<T>[] {
  return rows.map((r) => {
    const k: (string | number | null)[] = [];
    const copy: Record<string, unknown> = { ...r };
    for (let i = 0; i < nKeys; i++) {
      const v = copy[`_k${i}`];
      k.push(v === undefined ? null : (v as string | number | null));
      delete copy[`_k${i}`];
    }
    return { ...(copy as T), _k: k, _id: String(r[idCol]) } as Keyed<T>;
  });
}

/** Row-value keyset predicate. `cols` are SQL expressions comparable to the cursor key (same order). */
export function keysetWhere(p: Params, after: PageCursor | null, cols: string[], idCol: string, dir: 'asc' | 'desc', casts: string[]): string {
  if (!after) return 'true';
  const op = dir === 'asc' ? '>' : '<';
  const left = [...cols, idCol].join(', ');
  const right = [...after.k.map((v, i) => `${p.add(v)}::${casts[i] ?? 'text'}`), `${p.add(after.id)}::uuid`].join(', ');
  return `(${left}) ${op} (${right})`;
}

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
