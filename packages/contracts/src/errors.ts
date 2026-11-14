import { z } from '@hono/zod-openapi';

export const ErrorCodeSchema = z
  .enum([
    'VALIDATION_ERROR',
    'UNAUTHENTICATED',
    'ACCOUNT_REQUIRED',
    'FORBIDDEN',
    'NOT_FOUND',
    'MOVED_PERMANENTLY',
    'CONFLICT',
    'IDEMPOTENCY_CONFLICT',
    'VERSION_CONFLICT',
    'ALREADY_ATTEMPTED',
    'INVALID_STATE_TRANSITION',
    'PAYLOAD_TOO_LARGE',
    'UNSUPPORTED_MEDIA_TYPE',
    'PUBLISH_REQUIREMENTS_NOT_MET',
    'RATE_LIMITED',
    'INTERNAL',
    'SERVICE_UNAVAILABLE',
  ])
  .openapi('ErrorCode');
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status for each error code (API_CONTRACTS §1). */
export const ERROR_HTTP_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  ACCOUNT_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  MOVED_PERMANENTLY: 301,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  VERSION_CONFLICT: 409,
  ALREADY_ATTEMPTED: 409,
  INVALID_STATE_TRANSITION: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PUBLISH_REQUIREMENTS_NOT_MET: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<ErrorCode, number>;

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string(),
      details: z.unknown().optional(),
      request_id: z.string(),
    }),
  })
  .openapi('ErrorEnvelope');
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const ValidationIssueSchema = z.object({ path: z.string(), message: z.string() }).openapi('ValidationIssue');
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
