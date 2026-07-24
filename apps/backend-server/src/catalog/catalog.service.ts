import {
  CategoryDto,
  MenuDto,
  ModifierGroupDto,
  ProductDto,
  ProductStatus,
} from '@hyperzod/shared-types';
import { TenantContext } from '../tenancy/tenant-context';
import {
  Category,
  Product,
  ProductModifier,
  ProductModifierGroup,
} from '../database/entities';
import { PricedProductInput } from './pricing';

/**
 * Products that lost their category (categories -> products is ON DELETE SET
 * NULL, per data dictionary §7) would otherwise vanish from the menu. They get
 * a synthetic trailing category instead — invisible loss of a sellable item is
 * worse than an ugly heading.
 */
export const UNCATEGORIZED_ID = 'uncategorized';
const UNCATEGORIZED_NAME = 'More';

export class CatalogService {
  /**
   * Whole menu in four queries plus an in-memory join.
   *
   * Deliberately not a single query with joins: the modifier fan-out would
   * multiply every product row by its modifier count and force de-duplication
   * client-side. Four indexed reads inside one transaction is cheaper and the
   * assembly is obvious.
   */
  async getMenu(merchantId: string, opts: { activeOnly: boolean }): Promise<MenuDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const categoryWhere = opts.activeOnly
      ? { tenantId, merchantId, isActive: true }
      : { tenantId, merchantId };

    const categories = await manager.find(Category, {
      where: categoryWhere,
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    const productQuery = manager
      .createQueryBuilder(Product, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.merchant_id = :merchantId', { merchantId })
      .orderBy('p.sort_order', 'ASC')
      .addOrderBy('p.name', 'ASC');

    if (opts.activeOnly) {
      // OUT_OF_STOCK stays visible so customers can see what exists and is
      // temporarily unavailable; ARCHIVED is gone for good.
      productQuery.andWhere('p.status IN (:...visible)', {
        visible: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK],
      });
    }

    const products = await productQuery.getMany();
    if (products.length === 0) {
      return { categories: categories.map((c) => toCategoryDto(c, [])) };
    }

    const productIds = products.map((p) => p.id);

    const groups = await manager
      .createQueryBuilder(ProductModifierGroup, 'g')
      .where('g.tenant_id = :tenantId', { tenantId })
      .andWhere('g.product_id IN (:...productIds)', { productIds })
      .orderBy('g.sort_order', 'ASC')
      .addOrderBy('g.name', 'ASC')
      .getMany();

    const modifiers = groups.length
      ? await manager
          .createQueryBuilder(ProductModifier, 'm')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.group_id IN (:...groupIds)', { groupIds: groups.map((g) => g.id) })
          .andWhere(opts.activeOnly ? 'm.is_active = true' : '1=1')
          .orderBy('m.sort_order', 'ASC')
          .addOrderBy('m.name', 'ASC')
          .getMany()
      : [];

    const modifiersByGroup = groupBy(modifiers, (m) => m.groupId);
    const groupsByProduct = groupBy(groups, (g) => g.productId);

    const productDtos = products.map((product) =>
      toProductDto(
        product,
        (groupsByProduct.get(product.id) ?? []).map((group) =>
          toGroupDto(group, modifiersByGroup.get(group.id) ?? []),
        ),
      ),
    );

    const productsByCategory = groupBy(
      products.map((p, index) => ({ categoryId: p.categoryId, dto: productDtos[index]! })),
      (entry) => entry.categoryId ?? UNCATEGORIZED_ID,
    );

    const result: CategoryDto[] = categories.map((category) =>
      toCategoryDto(
        category,
        (productsByCategory.get(category.id) ?? []).map((e) => e.dto),
      ),
    );

    const orphans = productsByCategory.get(UNCATEGORIZED_ID) ?? [];
    if (orphans.length > 0) {
      result.push({
        id: UNCATEGORIZED_ID,
        name: UNCATEGORIZED_NAME,
        sort_order: Number.MAX_SAFE_INTEGER,
        is_active: true,
        products: orphans.map((e) => e.dto),
      });
    }

    return { categories: result };
  }

  async getProduct(productId: string, opts: { activeOnly: boolean }): Promise<ProductDto | null> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const product = await manager.findOne(Product, { where: { tenantId, id: productId } });
    if (!product) return null;
    if (opts.activeOnly && product.status === ProductStatus.ARCHIVED) return null;

    const groups = await manager.find(ProductModifierGroup, {
      where: { tenantId, productId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    const modifiers = groups.length
      ? await manager
          .createQueryBuilder(ProductModifier, 'm')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.group_id IN (:...groupIds)', { groupIds: groups.map((g) => g.id) })
          .andWhere(opts.activeOnly ? 'm.is_active = true' : '1=1')
          .orderBy('m.sort_order', 'ASC')
          .addOrderBy('m.name', 'ASC')
          .getMany()
      : [];

    const byGroup = groupBy(modifiers, (m) => m.groupId);
    return toProductDto(
      product,
      groups.map((g) => toGroupDto(g, byGroup.get(g.id) ?? [])),
    );
  }

  /**
   * Loads exactly what the pricing engine needs, for a batch of products.
   *
   * Checkout calls this inside its own transaction so the read that prices the
   * order and the write that records it see the same snapshot — a price edit
   * landing mid-checkout cannot split them.
   */
  async loadForPricing(productIds: readonly string[]): Promise<
    Map<string, { product: PricedProductInput; status: ProductStatus; currencyCode: string; merchantId: string }>
  > {
    const result = new Map<
      string,
      { product: PricedProductInput; status: ProductStatus; currencyCode: string; merchantId: string }
    >();
    if (productIds.length === 0) return result;

    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    const uniqueIds = [...new Set(productIds)];

    const products = await manager
      .createQueryBuilder(Product, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.id IN (:...uniqueIds)', { uniqueIds })
      .getMany();

    if (products.length === 0) return result;

    const groups = await manager
      .createQueryBuilder(ProductModifierGroup, 'g')
      .where('g.tenant_id = :tenantId', { tenantId })
      .andWhere('g.product_id IN (:...ids)', { ids: products.map((p) => p.id) })
      .orderBy('g.sort_order', 'ASC')
      .getMany();

    const modifiers = groups.length
      ? await manager
          .createQueryBuilder(ProductModifier, 'm')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.group_id IN (:...groupIds)', { groupIds: groups.map((g) => g.id) })
          .getMany()
      : [];

    const groupsByProduct = groupBy(groups, (g) => g.productId);
    const modifiersByGroup = groupBy(modifiers, (m) => m.groupId);

    for (const product of products) {
      const productGroups = groupsByProduct.get(product.id) ?? [];
      result.set(product.id, {
        status: product.status,
        currencyCode: product.currencyCode,
        merchantId: product.merchantId,
        product: {
          id: product.id,
          name: product.name,
          priceAmountCents: product.priceAmountCents,
          groups: productGroups.map((g) => ({
            id: g.id,
            name: g.name,
            selectionType: g.selectionType,
            isRequired: g.isRequired,
            minSelections: g.minSelections,
            maxSelections: g.maxSelections,
            sortOrder: g.sortOrder,
          })),
          modifiers: productGroups.flatMap((g) =>
            (modifiersByGroup.get(g.id) ?? []).map((m) => ({
              id: m.id,
              groupId: m.groupId,
              name: m.name,
              deltaPriceCents: m.deltaPriceCents,
              isActive: m.isActive,
            })),
          ),
        },
      });
    }

    return result;
  }

  /** Drives the menu ETag (API_AND_EVENT_CONTRACTS §3.2). */
  async menuUpdatedAt(merchantId: string): Promise<Date | null> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const [row] = await manager.query(
      `SELECT GREATEST(
                COALESCE((SELECT max(updated_at) FROM categories
                           WHERE tenant_id = $1 AND merchant_id = $2), 'epoch'),
                COALESCE((SELECT max(p.updated_at) FROM products p
                           WHERE p.tenant_id = $1 AND p.merchant_id = $2), 'epoch'),
                COALESCE((SELECT max(g.updated_at) FROM product_modifier_groups g
                           JOIN products p ON p.id = g.product_id AND p.tenant_id = g.tenant_id
                          WHERE g.tenant_id = $1 AND p.merchant_id = $2), 'epoch'),
                COALESCE((SELECT max(m.updated_at) FROM product_modifiers m
                           JOIN product_modifier_groups g
                             ON g.id = m.group_id AND g.tenant_id = m.tenant_id
                           JOIN products p ON p.id = g.product_id AND p.tenant_id = g.tenant_id
                          WHERE m.tenant_id = $1 AND p.merchant_id = $2), 'epoch')
              ) AS updated_at`,
      [tenantId, merchantId],
    );

    const value = row?.updated_at;
    if (!value) return null;

    const date = new Date(value);
    // The query COALESCEs to 'epoch' when the merchant has no catalog at all.
    // Compare against timestamp 0 — `new Date('epoch')` is an Invalid Date, so
    // comparing against it would be NaN === NaN and never match.
    return date.getTime() === 0 ? null : date;
  }
}

/* ------------------------------------------------------------------ mapping */

function toCategoryDto(category: Category, products: ProductDto[]): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    sort_order: category.sortOrder,
    is_active: category.isActive,
    products,
  };
}

function toProductDto(product: Product, modifierGroups: ModifierGroupDto[]): ProductDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price_amount_cents: product.priceAmountCents,
    currency_code: product.currencyCode,
    status: product.status,
    image_url: product.imageUrl,
    sort_order: product.sortOrder,
    modifier_groups: modifierGroups,
  };
}

function toGroupDto(group: ProductModifierGroup, modifiers: ProductModifier[]): ModifierGroupDto {
  return {
    id: group.id,
    name: group.name,
    selection_type: group.selectionType,
    is_required: group.isRequired,
    min_selections: group.minSelections,
    max_selections: group.maxSelections,
    sort_order: group.sortOrder,
    modifiers: modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      delta_price_cents: m.deltaPriceCents,
      is_default: m.isDefault,
      sort_order: m.sortOrder,
    })),
  };
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
