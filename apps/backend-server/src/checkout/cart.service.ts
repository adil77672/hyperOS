import {
  ApiErrorCode,
  CartDto,
  CartItemDto,
  CartItemInput,
  ProductStatus,
} from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import { CatalogService } from '../catalog/catalog.service';
import { ModifierValidationError, computeTotals, priceLine } from '../catalog/pricing';
import { RedisKeys } from '../redis/redis-keys';
import { RedisService } from '../redis/redis.service';
import { TenantContext } from '../tenancy/tenant-context';
import { Tenant } from '../database/entities';

const CART_TTL_SECONDS = 604_800; // 7d (PRODUCT_MAPPING §6)

/**
 * Session-backed anonymous cart.
 *
 * Only ids and quantities are stored. Prices are re-derived on every read, so
 * a menu price change is reflected the next time the customer opens their cart
 * rather than being frozen at whatever it was when they added the item.
 *
 * Note: API_AND_EVENT_CONTRACTS §4.1 describes the cart as a field on the
 * session record, while PRODUCT_MAPPING §6 gives it a dedicated
 * `cart:{tenantId}:{sessionId}` key. The dedicated key wins here — it carries
 * the tenant in the key itself and expires on its own 7-day clock instead of
 * riding the session's 30-day one.
 */
export class CartService {
  constructor(
    private readonly redis: RedisService,
    private readonly catalog: CatalogService,
  ) {}

  async get(): Promise<CartDto> {
    return this.price(await this.readRaw());
  }

  async replace(items: CartItemInput[]): Promise<CartDto> {
    // Price before persisting: an invalid cart is rejected rather than stored
    // and then failed at checkout.
    const priced = await this.price(items);
    await this.writeRaw(items);
    return priced;
  }

  async clear(): Promise<void> {
    const { tenantId, sessionId } = this.keyParts();
    await this.redis.client.del(RedisKeys.cart(tenantId, sessionId));
  }

  private async readRaw(): Promise<CartItemInput[]> {
    const { tenantId, sessionId } = this.keyParts();
    const raw = await this.redis.client.get(RedisKeys.cart(tenantId, sessionId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CartItemInput[]) : [];
    } catch {
      return [];
    }
  }

  private async writeRaw(items: CartItemInput[]): Promise<void> {
    const { tenantId, sessionId } = this.keyParts();
    const key = RedisKeys.cart(tenantId, sessionId);
    if (items.length === 0) {
      await this.redis.client.del(key);
      return;
    }
    await this.redis.client.set(key, JSON.stringify(items), 'EX', CART_TTL_SECONDS);
  }

  /**
   * Reprices a cart against the live menu.
   *
   * Uses the same priceLine() that checkout uses, so the total a customer is
   * shown and the total they are charged cannot diverge.
   */
  async price(items: CartItemInput[]): Promise<CartDto> {
    const currencyCode = await this.tenantCurrency();

    if (items.length === 0) {
      const totals = computeTotals([]);
      return {
        items: [],
        subtotal_cents: totals.subtotalCents,
        delivery_fee_cents: totals.deliveryFeeCents,
        tax_cents: totals.taxCents,
        discount_cents: totals.discountCents,
        total_cents: totals.totalCents,
        currency_code: currencyCode,
      };
    }

    const catalog = await this.catalog.loadForPricing(items.map((i) => i.product_id));
    const lines: CartItemDto[] = [];

    items.forEach((item, index) => {
      const entry = catalog.get(item.product_id);
      // A product deleted or archived since it was added is dropped silently
      // here — the cart is a preview, and checkout is where an unavailable
      // product becomes a hard 409.
      if (!entry || entry.status === ProductStatus.ARCHIVED) return;

      try {
        const priced = priceLine(entry.product, item.quantity, item.selected_modifier_ids ?? []);
        lines.push({
          line_id: `l${index + 1}`,
          product_id: item.product_id,
          product_name: entry.product.name,
          quantity: item.quantity,
          selected_modifiers: priced.selected.map((m) => ({
            id: m.id,
            group_name: m.groupName,
            name: m.name,
            delta_price_cents: m.deltaPriceCents,
          })),
          unit_price_cents: priced.unitPriceCents,
          line_total_cents: priced.lineTotalCents,
          notes: item.notes ?? null,
        });
      } catch (err) {
        if (err instanceof ModifierValidationError) {
          // Same reasoning: a line that no longer validates (a modifier was
          // retired) drops out of the preview instead of breaking the page.
          return;
        }
        throw err;
      }
    });

    const totals = computeTotals(lines.map((l) => l.line_total_cents));

    return {
      items: lines,
      subtotal_cents: totals.subtotalCents,
      delivery_fee_cents: totals.deliveryFeeCents,
      tax_cents: totals.taxCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      currency_code: currencyCode,
    };
  }

  private async tenantCurrency(): Promise<string> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) {
      throw ApiException.conflict(ApiErrorCode.CONFLICT, 'Storefront is unavailable.');
    }
    return tenant.defaultCurrencyCode;
  }

  private keyParts(): { tenantId: string; sessionId: string } {
    const ctx = TenantContext.require();
    if (!ctx.sessionId) throw ApiException.forbidden('No storefront session.');
    return { tenantId: TenantContext.requireTenantId(), sessionId: ctx.sessionId };
  }
}
