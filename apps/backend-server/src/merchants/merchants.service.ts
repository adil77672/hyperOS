import { MerchantStatus, StorefrontMerchantDto, UserRole } from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import { Merchant } from '../database/entities';
import { TenantContext } from '../tenancy/tenant-context';

export class MerchantsService {
  /**
   * The merchant a storefront renders.
   *
   * v1 is one merchant per tenant (PRODUCT_MAPPING §1.1 — signup creates a
   * single starter merchant), so "the merchant" is well defined. When
   * multi-location arrives this becomes a lookup by URL segment; picking the
   * oldest active one keeps that change from being a behaviour change for
   * existing single-merchant tenants.
   */
  async findStorefrontMerchant(): Promise<Merchant | null> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    return manager.findOne(Merchant, {
      where: { tenantId, status: MerchantStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(merchantId: string): Promise<Merchant | null> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    return manager.findOne(Merchant, { where: { tenantId, id: merchantId } });
  }

  /** All merchants visible to the current tenant JWT (dashboard bootstrap). */
  async listForTenant(): Promise<Merchant[]> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    return manager.find(Merchant, {
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Authorises a dashboard user against a specific merchant
   * (API_AND_EVENT_CONTRACTS §5.6).
   *
   * RLS already guarantees the merchant is in the caller's tenant — a row from
   * another tenant is simply not visible. What it cannot express is which
   * merchants *within* the tenant a user may operate, so that check lives here.
   */
  async assertAccess(merchantId: string): Promise<Merchant> {
    const ctx = TenantContext.require();
    const merchant = await this.findById(merchantId);

    // Not found and not-yours are the same 404 on purpose: distinguishing them
    // would confirm that a merchant id exists in some tenant.
    if (!merchant) throw ApiException.notFound('Merchant');

    if (ctx.role === UserRole.TENANT_ADMIN || ctx.role === UserRole.SUPER_ADMIN) {
      return merchant;
    }

    if (ctx.role === UserRole.MERCHANT_OWNER) {
      if (merchant.ownerUserId !== ctx.userId) throw ApiException.notFound('Merchant');
      return merchant;
    }

    if (ctx.role === UserRole.MERCHANT_STAFF) {
      // Staff are tenant-scoped in v1: per-merchant staff assignment needs a
      // join table that PRODUCT_MAPPING §1.9 defers to Phase 3 ("fine-grained
      // per-module permissions"). Tenant scoping is the honest v1 boundary.
      return merchant;
    }

    throw ApiException.forbidden();
  }

  /**
   * Operating settings a merchant changes day to day (PRODUCT_MAPPING §1.5).
   *
   * `status` is not settable here on purpose: suspending or closing a merchant
   * is a control-plane decision, not a dashboard toggle. `accepting_orders` is
   * the toggle merchants actually want.
   */
  async updateSettings(
    merchant: Merchant,
    patch: {
      name?: string;
      description?: string | null;
      accepting_orders?: boolean;
      avg_prep_minutes?: number;
      contact_phone?: string | null;
    },
  ): Promise<Merchant> {
    const manager = TenantContext.requireManager();

    if (patch.name !== undefined) merchant.name = patch.name.trim();
    if (patch.description !== undefined) merchant.description = patch.description?.trim() || null;
    if (patch.accepting_orders !== undefined) merchant.acceptingOrders = patch.accepting_orders;
    if (patch.avg_prep_minutes !== undefined) merchant.avgPrepMinutes = patch.avg_prep_minutes;
    if (patch.contact_phone !== undefined) {
      merchant.contactPhone = patch.contact_phone?.trim() || null;
    }

    return manager.save(Merchant, merchant);
  }

  toDto(merchant: Merchant): StorefrontMerchantDto {
    return {
      id: merchant.id,
      name: merchant.name,
      description: merchant.description,
      accepting_orders: merchant.acceptingOrders,
      avg_prep_minutes: merchant.avgPrepMinutes,
      contact_phone: merchant.contactPhone,
      status: merchant.status,
    };
  }
}
