import { randomBytes } from 'node:crypto';
import {
  ApiErrorCode,
  MerchantStatus,
  OrderDto,
  OrderFulfillmentType,
  OrderStatus,
  ProductStatus,
} from '@hyperzod/shared-types';
import { ApiException, HttpStatus } from '../common/api-exception';
import { Logger } from '../common/logger';
import { CatalogService } from '../catalog/catalog.service';
import { ModifierValidationError, computeTotals, priceLine } from '../catalog/pricing';
import { Order, OrderItem, OrderItemModifier, Tenant } from '../database/entities';
import { MerchantsService } from '../merchants/merchants.service';
import { ORDER_CREATED, OrderCreatedEvent } from '../orders/order.events';
import { toOrderDto } from '../orders/order.mapper';
import { RedisKeys } from '../redis/redis-keys';
import { RedisService } from '../redis/redis.service';
import { TenantContext } from '../tenancy/tenant-context';
import { CheckoutDto } from './dto/checkout.dto';
import { CartService } from './cart.service';

const ORDER_VIEW_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export class CheckoutService {
  private readonly logger = new Logger('CheckoutService');

  constructor(
    private readonly catalog: CatalogService,
    private readonly merchants: MerchantsService,
    private readonly cart: CartService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Places an order (API_AND_EVENT_CONTRACTS §4.2–4.3).
   *
   * Runs entirely inside the request's RLS transaction, so the prices read and
   * the rows written are one atomic unit — a merchant editing a price
   * mid-checkout cannot land between the two.
   */
  async placeOrder(dto: CheckoutDto): Promise<{ order: OrderDto; viewToken: string }> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) throw ApiException.notFound('Storefront');

    const merchant = await this.merchants.findStorefrontMerchant();
    if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
      throw ApiException.notFound('Storefront');
    }

    if (!merchant.acceptingOrders) {
      throw new ApiException(
        ApiErrorCode.MERCHANT_NOT_ACCEPTING,
        'This store is not accepting orders right now.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (dto.fulfillment_type === OrderFulfillmentType.DELIVERY && !dto.delivery_address?.trim()) {
      throw ApiException.validation('A delivery address is required for delivery orders.', {
        field: 'delivery_address',
      });
    }

    /* ------------------------------------------------ price every line */

    const catalog = await this.catalog.loadForPricing(dto.items.map((i) => i.product_id));
    const priced = dto.items.map((item, index) => {
      const entry = catalog.get(item.product_id);

      if (!entry) {
        // Unknown id and other-tenant id are the same 404 shape: RLS already
        // hid the latter, and saying more would confirm it exists somewhere.
        throw ApiException.notFound('Product');
      }

      if (entry.merchantId !== merchant.id) {
        throw ApiException.notFound('Product');
      }

      if (entry.status !== ProductStatus.ACTIVE) {
        throw ApiException.conflict(
          ApiErrorCode.PRODUCT_UNAVAILABLE,
          `"${entry.product.name}" is no longer available.`,
          { item_index: index, product_id: item.product_id, status: entry.status },
        );
      }

      try {
        return {
          input: item,
          entry,
          line: priceLine(entry.product, item.quantity, item.selected_modifier_ids ?? []),
        };
      } catch (err) {
        if (err instanceof ModifierValidationError) {
          throw new ApiException(
            ApiErrorCode.MODIFIER_VALIDATION_FAILED,
            err.message,
            HttpStatus.UNPROCESSABLE_ENTITY,
            { item_index: index, reason: err.reason, ...err.context },
          );
        }
        throw err;
      }
    });

    const totals = computeTotals(priced.map((p) => p.line.lineTotalCents));

    /* ------------------------------------------------------ write rows */

    const orderNumber = await this.allocateOrderNumber(tenantId, merchant.id, tenant.timezone);
    const ctx = TenantContext.require();

    const order = manager.create(Order, {
      tenantId,
      merchantId: merchant.id,
      // Guest checkout: no users row exists for the customer until Phase 2.
      customerId: null,
      driverId: null,
      orderNumber,
      status: OrderStatus.PENDING,
      fulfillmentType: dto.fulfillment_type,
      subtotalCents: totals.subtotalCents,
      deliveryFeeCents: totals.deliveryFeeCents,
      taxCents: totals.taxCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      currencyCode: tenant.defaultCurrencyCode,
      customerFullName: dto.customer.full_name.trim(),
      customerContactEmail: dto.customer.contact_email.trim(),
      customerContactPhone: dto.customer.contact_phone.trim(),
      deliveryAddress: dto.delivery_address?.trim() || null,
      notes: dto.notes?.trim() || null,
      placedAt: new Date(),
    });

    await manager.save(Order, order);

    const savedItems: OrderItem[] = [];
    const savedModifiers: OrderItemModifier[] = [];

    for (const [index, entry] of priced.entries()) {
      const item = manager.create(OrderItem, {
        tenantId,
        orderId: order.id,
        productId: entry.input.product_id,
        // Snapshot: the name is copied so renaming the product later does not
        // rewrite what the customer actually bought.
        productName: entry.entry.product.name,
        unitPriceCents: entry.line.unitPriceCents,
        quantity: entry.input.quantity,
        lineTotalCents: entry.line.lineTotalCents,
        notes: entry.input.notes?.trim() || null,
        sortOrder: index,
      });
      await manager.save(OrderItem, item);
      savedItems.push(item);

      for (const modifier of entry.line.selected) {
        const row = manager.create(OrderItemModifier, {
          tenantId,
          orderItemId: item.id,
          modifierId: modifier.id,
          groupName: modifier.groupName,
          modifierName: modifier.name,
          deltaPriceCents: modifier.deltaPriceCents,
        });
        await manager.save(OrderItemModifier, row);
        savedModifiers.push(row);
      }
    }

    /* ------------------------------------------------------ side effects */

    const viewToken = randomBytes(24).toString('base64url');
    await this.redis.client.set(
      RedisKeys.orderViewToken(viewToken),
      JSON.stringify({ tenantId, orderId: order.id }),
      'EX',
      ORDER_VIEW_TOKEN_TTL_SECONDS,
    );

    if (ctx.sessionId) {
      const key = RedisKeys.sessionOrders(tenantId, ctx.sessionId);
      await this.redis.client
        .multi()
        .sadd(key, order.id)
        .expire(key, ORDER_VIEW_TOKEN_TTL_SECONDS)
        .exec();
    }

    await this.cart.clear();

    // Queued, not emitted — flushed by RlsTransactionInterceptor after COMMIT
    // so a dashboard reacting to the SSE frame can actually read the order.
    TenantContext.enqueueEvent(
      ORDER_CREATED,
      new OrderCreatedEvent(tenantId, merchant.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        fulfillmentType: order.fulfillmentType,
        totalCents: order.totalCents,
        currencyCode: order.currencyCode,
        placedAt: order.placedAt,
        customerFullName: order.customerFullName,
        itemCount: savedItems.length,
      }),
    );

    this.logger.log(
      `order ${orderNumber} placed (${totals.totalCents} ${order.currencyCode}, session ${ctx.sessionId})`,
    );

    return { order: toOrderDto(order, savedItems, savedModifiers), viewToken };
  }

  /**
   * `ORD-YYYYMMDD-NNNNN`, monotonic per merchant per local business day.
   *
   * API_AND_EVENT_CONTRACTS §4.3 step 5 flags the format as an assumption. The
   * counter lives in Postgres rather than Redis because the number has to be
   * unique in the same transaction that writes the order — a Redis counter
   * would hand out numbers that a rolled-back transaction never uses.
   */
  private async allocateOrderNumber(
    tenantId: string,
    merchantId: string,
    timezone: string,
  ): Promise<string> {
    const manager = TenantContext.requireManager();

    const [row] = await manager.query(
      `WITH day AS (SELECT (now() AT TIME ZONE $3)::date AS d)
       SELECT to_char((SELECT d FROM day), 'YYYYMMDD') AS day_label,
              next_order_sequence($1, $2, (SELECT d FROM day)) AS seq`,
      [tenantId, merchantId, timezone],
    );

    const sequence = String(row.seq).padStart(5, '0');
    return `ORD-${row.day_label}-${sequence}`;
  }

  /** Resolves a one-time view token from the confirmation email (§4.4). */
  async resolveViewToken(token: string): Promise<{ tenantId: string; orderId: string } | null> {
    const raw = await this.redis.client.get(RedisKeys.orderViewToken(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { tenantId: string; orderId: string };
    } catch {
      return null;
    }
  }

  /** True when the current storefront session is the one that placed the order. */
  async sessionPlacedOrder(orderId: string): Promise<boolean> {
    const ctx = TenantContext.require();
    if (!ctx.sessionId || !ctx.tenantId) return false;

    const member = await this.redis.client.sismember(
      RedisKeys.sessionOrders(ctx.tenantId, ctx.sessionId),
      orderId,
    );
    return member === 1;
  }
}
