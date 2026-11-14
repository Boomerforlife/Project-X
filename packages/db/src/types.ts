export type JwtClaims = {
  sub: string;
  role: 'authenticated';
  email?: string;
  is_anonymous?: boolean;
  [k: string]: unknown;
};

export interface SqlTx {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
  /**
   * Run a multi-statement script (simple protocol, no parameters). Optional extension used by the migrator;
   * both bundled executors implement it.
   */
  exec?(text: string): Promise<void>;
}

export interface Db {
  /** 1 transaction on the connection role (owner/postgres) -> bypasses RLS. */
  withService<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  /** 1 transaction: request.jwt.claims set + SET LOCAL ROLE authenticated. */
  withUser<T>(claims: JwtClaims, fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  /** 1 transaction: claims {"role":"anon"} + SET LOCAL ROLE anon. */
  withAnon<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Common helper used by both executors. */
export function userClaimsJson(claims: JwtClaims): string {
  return JSON.stringify(claims);
}

export const ANON_CLAIMS_JSON = JSON.stringify({ role: 'anon' });
