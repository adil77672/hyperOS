/**
 * Every Redis key in the system, in one place.
 *
 * MASTER_CONTEXT §3.4 mandates tenant-prefixing. Centralising key construction
 * is what makes that auditable — an un-prefixed key is visible here as a
 * missing argument, not buried in a service.
 *
 * Catalog: PRODUCT_MAPPING §6.
 */
export const RedisKeys = {
  session: (sessionId: string) => `session:${sessionId}`,

  cart: (tenantId: string, sessionId: string) => `cart:${tenantId}:${sessionId}`,

  rateLimit: (scope: string, identifier: string) => `rate:${scope}:${identifier}`,

  refreshToken: (token: string) => `refresh:${token}`,

  idempotency: (tenantId: string, key: string) => `idem:${tenantId}:${key}`,

  /** One-time customer order view token (API contracts §4.4). */
  orderViewToken: (token: string) => `order-token:${token}`,

  /**
   * Orders placed by a storefront session. SET, so the session that placed an
   * order can re-read it without a token (API contracts §4.4). Lives in Redis
   * rather than an `orders.session_id` column because the data dictionary
   * defines no such column and session identity is not order data.
   */
  sessionOrders: (tenantId: string, sessionId: string) =>
    `session-orders:${tenantId}:${sessionId}`,

  sseChannel: (tenantId: string, merchantId: string) =>
    `sse:merchant-orders:${tenantId}:${merchantId}`,

  sseBuffer: (tenantId: string, merchantId: string) =>
    `sse:merchant-buffer:${tenantId}:${merchantId}`,

  tenantByDomain: (host: string) => `tenant:by-domain:${host}`,
} as const;
