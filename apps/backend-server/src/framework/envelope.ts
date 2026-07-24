/**
 * Success-envelope helpers (API_AND_EVENT_CONTRACTS §1.1: `{ data, meta? }`).
 *
 * Handlers return their payload plainly; the route wrapper envelopes it. A
 * handler that needs `meta` (pagination, ETag timing) returns
 * `withMeta(payload, meta)`.
 */
export class EnvelopedResponse<T> {
  constructor(
    readonly data: T,
    readonly meta: Record<string, unknown>,
  ) {}
}

export function withMeta<T>(data: T, meta: Record<string, unknown>): EnvelopedResponse<T> {
  return new EnvelopedResponse(data, meta);
}
