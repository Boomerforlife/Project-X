import postgres from 'postgres';
import { ANON_CLAIMS_JSON, userClaimsJson } from './types';
import type { Db, JwtClaims, SqlTx } from './types';

export interface PostgresDbOptions {
  url: string;
  /** Pool size (default 5). Use 1 against pglite-server. */
  max?: number;
  /** Must stay false behind Supavisor transaction pooling (default false). */
  prepare?: false;
  /** Idle seconds before a pooled connection is closed (default 20). */
  idleTimeout?: number;
  /** Receive NOTICE messages (default: ignored). */
  onNotice?: (notice: unknown) => void;
}

// reason: postgres.js `TransactionSql` is generic over the type map; we only use `unsafe`/`array`.
type PgTx = postgres.TransactionSql<Record<string, unknown>>;

function wrapTx(tx: PgTx): SqlTx {
  return {
    async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      // reason: postgres.js parameter typing is stricter than our `unknown[]` contract; values are plain JS primitives/JSON strings.
      const values = params.map((p) => (Array.isArray(p) ? tx.array(p as never) : p)) as never[];
      const res = await tx.unsafe<T[]>(text, values);
      return { rows: Array.from(res) as T[], rowCount: res.count ?? res.length };
    },
    async exec(text: string) {
      await tx.unsafe(text).simple();
    },
  };
}

export function createPostgresDb(opts: PostgresDbOptions): Db {
  const sql = postgres(opts.url, {
    max: opts.max ?? 5,
    prepare: opts.prepare ?? false,
    idle_timeout: opts.idleTimeout ?? 20,
    onnotice: opts.onNotice ?? (() => undefined),
    // keep numeric/int8 as strings (postgres.js default); dates/timestamps parse to Date.
    // Our contract passes JSON params as JSON.stringify(x) + `$n::jsonb`. postgres.js would JSON.stringify the string a
    // second time (double-encoding into a jsonb string scalar), so strings are passed through verbatim here.
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x) as unknown,
      },
    },
  });

  async function run<T>(claimsJson: string | null, role: 'authenticated' | 'anon' | null, fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    // reason: sql.begin's callback return type is a tuple-aware conditional; we return exactly T.
    return (await sql.begin(async (raw) => {
      const tx = raw as unknown as PgTx;
      if (claimsJson !== null && role !== null) {
        await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [claimsJson]);
        await tx.unsafe(`set local role ${role}`);
      }
      return (await fn(wrapTx(tx))) as never;
    })) as T;
  }

  return {
    withService: (fn) => run(null, null, fn),
    withUser: (claims: JwtClaims, fn) => run(userClaimsJson(claims), 'authenticated', fn),
    withAnon: (fn) => run(ANON_CLAIMS_JSON, 'anon', fn),
    close: () => sql.end({ timeout: 5 }),
  };
}
