import { ApiErrorCode } from '@hyperzod/shared-types';

/** HTTP status codes used across the app. Small local enum; no framework dep. */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * The only exception type this codebase throws deliberately.
 *
 * A plain Error subclass — no framework coupling. It carries the
 * machine-readable `code`, HTTP `status`, and optional `details` so the error
 * middleware can emit API_AND_EVENT_CONTRACTS §1.2's envelope directly.
 */
export class ApiException extends Error {
  constructor(
    readonly code: ApiErrorCode | string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiException';
  }

  static unauthenticated(message = 'Authentication required.'): ApiException {
    return new ApiException(ApiErrorCode.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have access to this resource.'): ApiException {
    return new ApiException(ApiErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  /**
   * Deliberately shapeless: a 404 must be indistinguishable whether the row
   * does not exist or exists in another tenant. Callers pass a resource label
   * only, never an id echoed back from a cross-tenant lookup.
   */
  static notFound(resource = 'Resource'): ApiException {
    return new ApiException(ApiErrorCode.NOT_FOUND, `${resource} not found.`, HttpStatus.NOT_FOUND);
  }

  static validation(message: string, details?: Record<string, unknown>): ApiException {
    return new ApiException(
      ApiErrorCode.VALIDATION_FAILED,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  static conflict(
    code: ApiErrorCode | string,
    message: string,
    details?: Record<string, unknown>,
  ): ApiException {
    return new ApiException(code, message, HttpStatus.CONFLICT, details);
  }

  static rateLimited(retryAfterSeconds: number): ApiException {
    return new ApiException(
      ApiErrorCode.RATE_LIMITED,
      'Too many requests.',
      HttpStatus.TOO_MANY_REQUESTS,
      { retry_after: retryAfterSeconds },
    );
  }

  static internal(message = 'An unexpected error occurred.'): ApiException {
    return new ApiException(ApiErrorCode.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
