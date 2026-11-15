import type { ErrorCode } from "@projectx/contracts";

export type ApiErrorCode = ErrorCode | "NETWORK" | "BAD_RESPONSE";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryAfterSec?: number;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    extra: { details?: unknown; requestId?: string; retryAfterSec?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.requestId = extra.requestId;
    this.retryAfterSec = extra.retryAfterSec;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
