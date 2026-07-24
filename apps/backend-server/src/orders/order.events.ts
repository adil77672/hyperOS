import { OrderFulfillmentType, OrderStatus } from '@hyperzod/shared-types';

export const ORDER_CREATED = 'order.created';
export const ORDER_STATUS_CHANGED = 'order.status_changed';

/**
 * In-process domain events (MASTER_CONTEXT §7.1).
 *
 * They carry the tenant and merchant explicitly rather than reading them from
 * AsyncLocalStorage: the SSE listener runs after the request transaction has
 * committed, and may well run on a different tick with no context at all.
 */
export class OrderCreatedEvent {
  constructor(
    readonly tenantId: string,
    readonly merchantId: string,
    readonly payload: {
      orderId: string;
      orderNumber: string;
      status: OrderStatus;
      fulfillmentType: OrderFulfillmentType;
      totalCents: number;
      currencyCode: string;
      placedAt: Date;
      customerFullName: string;
      itemCount: number;
    },
  ) {}
}

export class OrderStatusChangedEvent {
  constructor(
    readonly tenantId: string,
    readonly merchantId: string,
    readonly payload: {
      orderId: string;
      orderNumber: string;
      previousStatus: OrderStatus;
      newStatus: OrderStatus;
      changedAt: Date;
      cancellationReason: string | null;
    },
  ) {}
}
