import type { CacheInvalidator, RateLimiter, StorageSet } from '@projectx/edge';
import type { Db, JwtClaims } from '@projectx/db';
import type { RazorpayClient } from './billing/razorpay';
import type { AppConfig } from './config';
import type { Store } from './repositories/types';

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  claims: JwtClaims;
}

export interface AuthVerifier {
  /** Returns the verified user, or null when the token is missing/invalid/expired. Never throws. */
  verify(token: string): Promise<AuthUser | null>;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface AppDeps {
  config: AppConfig;
  db: Db;
  storage: StorageSet;
  cache: CacheInvalidator;
  rateLimiter: RateLimiter;
  auth: AuthVerifier;
  clock: () => Date;
  logger: Logger;
  waitUntil(p: Promise<unknown>): void;
  /** Override the repository gateway (route tests use the memory store); default = SQL store over `db`. */
  store?: Store;
  /** Override the Razorpay client (tests); default = built from RAZORPAY_* config, or null when billing is off. */
  razorpay?: RazorpayClient | null;
}

export function createConsoleLogger(level: AppConfig['LOG_LEVEL']): Logger {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const min = order[level];
  const emit = (lvl: keyof typeof order, msg: string, fields?: Record<string, unknown>) => {
    if (order[lvl] < min) return;
    const line = JSON.stringify({ level: lvl, msg, ...fields });
    if (lvl === 'error') console.error(line);
    else if (lvl === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
