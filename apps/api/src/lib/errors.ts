import { ERROR_HTTP_STATUS, type ErrorCode } from '@projectx/contracts';
import type { CacheClass } from '@projectx/edge';

/** Typed application error; mapped to the error envelope by the error middleware. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers: Record<string, string>;
  /** Public-route negative caching (404/301 on slug routes). */
  readonly cache?: { cls: CacheClass; tags: string[] };
  constructor(
    code: ErrorCode,
    message: string,
    opts?: { details?: unknown; headers?: Record<string, string>; cache?: { cls: CacheClass; tags: string[] }; status?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts?.status ?? ERROR_HTTP_STATUS[code];
    this.details = opts?.details;
    this.headers = opts?.headers ?? {};
    if (opts?.cache) this.cache = opts.cache;
  }
}

export const notFound = (what = 'Resource'): ApiError => new ApiError('NOT_FOUND', `${what} not found`);
export const validation = (message: string, details?: unknown): ApiError =>
  new ApiError('VALIDATION_ERROR', message, { details });
export const forbidden = (message = 'Forbidden'): ApiError => new ApiError('FORBIDDEN', message);
export const invalidState = (from: string, action: string, message?: string): ApiError =>
  new ApiError('INVALID_STATE_TRANSITION', message ?? `Cannot ${action} from ${from}`, { details: { from, action } });

/**
 * Map a raw DB error (trigger RAISE / constraint) to an ApiError, or null if unknown.
 * Raw DB messages never reach clients.
 */
export function mapDbError(e: unknown): ApiError | null {
  if (!e || typeof e !== 'object') return null;
  const err = e as { message?: unknown; code?: unknown };
  const msg = typeof err.message === 'string' ? err.message : '';
  const sqlstate = typeof err.code === 'string' ? err.code : '';
  if (msg.includes('PUBLISH_REQUIREMENTS_NOT_MET')) {
    const reason = msg.split('PUBLISH_REQUIREMENTS_NOT_MET:')[1]?.trim();
    return new ApiError('PUBLISH_REQUIREMENTS_NOT_MET', 'Publish requirements not met', {
      details: { unmet: reason ? [reason] : [] },
    });
  }
  if (msg.includes('SLUG_LOCKED')) return new ApiError('CONFLICT', 'Slug is locked after first publication', { details: { reason: 'SLUG_LOCKED' } });
  if (msg.includes('TAXONOMY_MISMATCH')) return new ApiError('VALIDATION_ERROR', 'Taxonomy ids are inconsistent', { details: { reason: 'TAXONOMY_MISMATCH' } });
  if (msg.includes('SOURCE_NOT_APPROVED')) return new ApiError('CONFLICT', 'Source is not approved', { details: { reason: 'SOURCE_NOT_APPROVED' } });
  if (msg.includes('INVALID_TIMEZONE')) return new ApiError('VALIDATION_ERROR', 'Invalid timezone', { details: { reason: 'INVALID_TIMEZONE' } });
  if (msg.includes('QUESTION_NOT_PRACTICABLE')) return new ApiError('NOT_FOUND', 'Question not found');
  if (msg.includes('SOLUTION_IMMUTABLE')) return new ApiError('CONFLICT', 'Solution versions are immutable');
  if (sqlstate === '23505') return new ApiError('CONFLICT', 'Conflicting resource');
  if (sqlstate === '23503') return new ApiError('VALIDATION_ERROR', 'Referenced resource does not exist');
  if (sqlstate === '23514' || sqlstate === '22P02' || sqlstate === '22023') return new ApiError('VALIDATION_ERROR', 'Invalid value');
  return null;
}
