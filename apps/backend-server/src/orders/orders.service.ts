import {
  ALLOWED_ORDER_TRANSITIONS,
  ApiErrorCode,
  OrderDto,
  OrderStatus,
  REASON_REQUIRED_STATUSES,
} from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import { Logger } from '../common/logger';
import {
  DEFAULT_PAGE_LIMIT,
  OrderCursor,
  decodeCursor,
  encodeCursor,
} from '../common/pagination';
import { Order, OrderItem, OrderItemModifier } from '../database/entities';
import { TenantContext } from '../tenancy/tenant-context';
import { ORDER_STATUS_CHANGED, OrderStatusChangedEvent } from './order.events';
import { toOrderDto } from './order.mapper';

export interface ListOrdersFilter {
  merchantId: string;
  statuses?: OrderStatus[];
  limit?: number;
  cursor?: string;
  search?: string;
}

export class OrdersService {
  private readonly logger = new Logger('OrdersService');

  /**
   * Mirror of `enforce_order_status_transition()` in schema.sql.
   *
   * MASTER_CONTEXT §8 makes the trigger authoritative and this map a mirror.
   * Its purpose is to produce a documented 409 ORDER_INVALID_TRANSITION rather
   * than let a SQLSTATE 23514 surface as a 500 — not to be the rule itself.
   * The trigger still runs and still wins.
   */
  static readonly ALLOWED_TRANSITIONS = ALLOWED_ORDER_TRANSITIONS;

  async findById(orderId: string): Promise<OrderDto | null> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const order = await manager.findOne(Order, { where: { tenantId, id: orderId } });
    if (!order) return null;

    const items = await manager.find(OrderItem, { where: { tenantId, orderId } });
    const modifiers = items.length
      ? await manager
          .createQueryBuilder(OrderItemModifier, 'm')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.order_item_id IN (:...itemIds)', { itemIds: items.map((i) => i.id) })
          .getMany()
      : [];

    return toOrderDto(order, items, modifiers);
  }

  /** Keyset pagination on `(placed_at DESC, id DESC)` — matches idx_orders_merchant. */
  async list(filter: ListOrdersFilter): Promise<{ orders: OrderDto[]; nextCursor: string | null }> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    const limit = filter.limit ?? DEFAULT_PAGE_LIMIT;

    const query = manager
      .createQueryBuilder(Order, 'o')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.merchant_id = :merchantId', { merchantId: filter.merchantId })
      .orderBy('o.placed_at', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .limit(limit + 1); // one extra row tells us whether another page exists

    if (filter.statuses?.length) {
      query.andWhere('o.status IN (:...statuses)', { statuses: filter.statuses });
    }

    if (filter.search) {
      query.andWhere(
        '(o.order_number ILIKE :search OR o.customer_full_name ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    const cursor: OrderCursor | null = decodeCursor(filter.cursor);
    if (cursor) {
      query.andWhere('(o.placed_at, o.id) < (:placedAt, :cursorId)', {
        placedAt: cursor.placedAt,
        cursorId: cursor.id,
      });
    }

    const rows = await query.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    if (page.length === 0) return { orders: [], nextCursor: null };

    const items = await manager
      .createQueryBuilder(OrderItem, 'i')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('i.order_id IN (:...orderIds)', { orderIds: page.map((o) => o.id) })
      .getMany();

    const modifiers = items.length
      ? await manager
          .createQueryBuilder(OrderItemModifier, 'm')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.order_item_id IN (:...itemIds)', { itemIds: items.map((i) => i.id) })
          .getMany()
      : [];

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      const bucket = itemsByOrder.get(item.orderId);
      if (bucket) bucket.push(item);
      else itemsByOrder.set(item.orderId, [item]);
    }

    const last = page[page.length - 1]!;
    return {
      orders: page.map((order) => toOrderDto(order, itemsByOrder.get(order.id) ?? [], modifiers)),
      nextCursor: hasMore
        ? encodeCursor({ placedAt: last.placedAt.toISOString(), id: last.id })
        : null,
    };
  }

  /**
   * The FSM entry point (API_AND_EVENT_CONTRACTS §6).
   *
   * Row is locked FOR UPDATE before the guard runs. Without the lock, two
   * dashboard tabs both reading PENDING could both pass the check and one
   * would then hit the trigger — a 500 where a 409 belongs.
   */
  async transition(
    orderId: string,
    targetStatus: OrderStatus,
    reason: string | null,
  ): Promise<OrderDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const order = await manager
      .createQueryBuilder(Order, 'o')
      .setLock('pessimistic_write')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.id = :orderId', { orderId })
      .getOne();

    if (!order) throw ApiException.notFound('Order');

    const previousStatus = order.status;

    if (previousStatus === targetStatus) {
      // Idempotent no-op: a double-clicked "Accept" should not 409.
      const current = await this.findById(orderId);
      return current!;
    }

    const allowed = OrdersService.ALLOWED_TRANSITIONS[previousStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw ApiException.conflict(
        ApiErrorCode.ORDER_INVALID_TRANSITION,
        `Order cannot transition from ${previousStatus} to ${targetStatus}.`,
        { from_status: previousStatus, to_status: targetStatus },
      );
    }

    const trimmedReason = reason?.trim() || null;
    if (REASON_REQUIRED_STATUSES.includes(targetStatus) && !trimmedReason) {
      throw ApiException.validation(`A reason is required when moving an order to ${targetStatus}.`, {
        field: 'reason',
      });
    }

    order.status = targetStatus;
    if (trimmedReason) order.cancellationReason = trimmedReason;

    // Lifecycle timestamps (accepted_at, ready_at, ...) are set by the trigger,
    // so they are deliberately not assigned here.
    await manager.save(Order, order);

    // Re-read to pick up the trigger's timestamp writes.
    const updated = await this.findById(orderId);

    const changedAt = new Date();
    // Queued, not emitted: the request transaction has not committed yet.
    TenantContext.enqueueEvent(
      ORDER_STATUS_CHANGED,
      new OrderStatusChangedEvent(tenantId, order.merchantId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus: targetStatus,
        changedAt,
        cancellationReason: trimmedReason,
      }),
    );

    this.logger.log(`order ${order.orderNumber}: ${previousStatus} -> ${targetStatus}`);
    return updated!;
  }
}
