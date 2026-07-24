/**
 * Mirrors the Postgres enum types in
 * `apps/backend-server/src/database/schema.sql`.
 *
 * schema.sql is authoritative (SYSTEM_DATA_DICTIONARY.md preamble). If a value
 * is added there it must be added here, and vice versa is not permitted.
 */

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  MERCHANT_OWNER = 'MERCHANT_OWNER',
  MERCHANT_STAFF = 'MERCHANT_STAFF',
  DRIVER = 'DRIVER',
  CUSTOMER = 'CUSTOMER',
}

export enum MerchantStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  ARCHIVED = 'ARCHIVED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  MERCHANT_ACCEPTED = 'MERCHANT_ACCEPTED',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
}

export enum OrderFulfillmentType {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
}

export enum ModifierSelectionType {
  SINGLE = 'SINGLE',
  MULTIPLE = 'MULTIPLE',
}

export enum CustomDomainStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  SSL_ISSUED = 'SSL_ISSUED',
  ACTIVE = 'ACTIVE',
  FAILED = 'FAILED',
}

/**
 * Mirror of the `enforce_order_status_transition()` trigger in schema.sql.
 * HYPERZOD_MASTER_CONTEXT.md §8: the DB trigger is authoritative, this map is
 * the application-layer mirror that lets us fail fast with a 409 instead of
 * bubbling a SQLSTATE 23514 out of Postgres.
 */
export const ALLOWED_ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.MERCHANT_ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.MERCHANT_ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  // DELIVERED is the Phase 1 self-delivery shortcut (PRODUCT_MAPPING §1.4).
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.DELIVERY_FAILED]: [],
} as const;

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERY_FAILED,
];

/** Transitions that require a non-empty `reason` (API_AND_EVENT_CONTRACTS §6). */
export const REASON_REQUIRED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERY_FAILED,
];
