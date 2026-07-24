/** API_AND_EVENT_CONTRACTS.md §1.3 — stable, machine-readable error codes. */
export enum ApiErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  CONFLICT = 'CONFLICT',
  ORDER_INVALID_TRANSITION = 'ORDER_INVALID_TRANSITION',
  MODIFIER_VALIDATION_FAILED = 'MODIFIER_VALIDATION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Checkout-specific codes (§4.3).
  PRODUCT_UNAVAILABLE = 'PRODUCT_UNAVAILABLE',
  MERCHANT_NOT_ACCEPTING = 'MERCHANT_NOT_ACCEPTING',
}

/** `details.reason` values for MODIFIER_VALIDATION_FAILED (§4.3). */
export enum ModifierValidationReason {
  REQUIRED_GROUP_MISSING = 'REQUIRED_GROUP_MISSING',
  TOO_MANY_SELECTIONS = 'TOO_MANY_SELECTIONS',
  TOO_FEW_SELECTIONS = 'TOO_FEW_SELECTIONS',
  MULTIPLE_SELECTIONS_IN_SINGLE_GROUP = 'MULTIPLE_SELECTIONS_IN_SINGLE_GROUP',
  MODIFIER_NOT_IN_PRODUCT = 'MODIFIER_NOT_IN_PRODUCT',
  MODIFIER_INACTIVE = 'MODIFIER_INACTIVE',
  DUPLICATE_MODIFIER = 'DUPLICATE_MODIFIER',
}

export interface ApiError {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  next_cursor: string | null;
  has_more: boolean;
  [key: string]: unknown;
}
