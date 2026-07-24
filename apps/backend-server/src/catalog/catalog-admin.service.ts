import {
  CategoryDto,
  ModifierDto,
  ModifierGroupDto,
  ModifierSelectionType,
  ProductDto,
} from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import {
  Category,
  Product,
  ProductModifier,
  ProductModifierGroup,
  Tenant,
} from '../database/entities';
import { TenantContext } from '../tenancy/tenant-context';
import {
  CreateCategoryDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
  UpdateProductDto,
} from './dto/catalog.dto';

/**
 * Dashboard-side catalog CRUD (API_AND_EVENT_CONTRACTS §8).
 *
 * URL design follows the spec: creation is merchant-scoped
 * (`merchants/{id}/products`), but mutation of an existing resource is
 * resource-scoped (`products/{id}`, `modifier-groups/{id}/modifiers`). So the
 * create methods take a merchantId; the rest scope by `(tenant_id, id)` and
 * lean on RLS for tenant isolation.
 *
 * That is the honest v1 boundary: in v1 a tenant has one merchant
 * (PRODUCT_MAPPING §1.1), so tenant isolation and merchant isolation coincide.
 * When multi-merchant lands, the resource-scoped routes gain an ownership
 * derivation (load resource -> its merchant -> assertAccess); the seams for
 * that are the assertProduct/assertGroup helpers below.
 */
export class CatalogAdminService {
  /* -------------------------------------------------------- categories */

  async createCategory(merchantId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const category = manager.create(Category, {
      tenantId,
      merchantId,
      name: dto.name.trim(),
      sortOrder: dto.sort_order ?? 0,
      isActive: dto.is_active ?? true,
    });

    await this.saveUnique(
      () => manager.save(Category, category),
      'A category with that name already exists.',
    );
    return categoryDto(category, []);
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const category = await manager.findOne(Category, { where: { tenantId, id: categoryId } });
    if (!category) throw ApiException.notFound('Category');

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.sort_order !== undefined) category.sortOrder = dto.sort_order;
    if (dto.is_active !== undefined) category.isActive = dto.is_active;

    await this.saveUnique(
      () => manager.save(Category, category),
      'A category with that name already exists.',
    );
    return categoryDto(category, []);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    // categories -> products is ON DELETE SET NULL: the products survive and
    // fall into the synthetic "More" bucket rather than disappearing.
    const result = await manager.delete(Category, { tenantId, id: categoryId });
    if (!result.affected) throw ApiException.notFound('Category');
  }

  /* ---------------------------------------------------------- products */

  async createProduct(merchantId: string, dto: CreateProductDto): Promise<ProductDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    // Currency is never accepted from the client (§8.1) — it is inherited from
    // the tenant at write time so a merchant cannot price in a foreign unit.
    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) throw ApiException.notFound('Tenant');

    if (dto.category_id) await this.assertCategory(merchantId, dto.category_id);

    const product = manager.create(Product, {
      tenantId,
      merchantId,
      categoryId: dto.category_id ?? null,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      priceAmountCents: dto.price_amount_cents,
      currencyCode: tenant.defaultCurrencyCode,
      status: dto.status ?? undefined,
      imageUrl: dto.image_url?.trim() || null,
      sortOrder: dto.sort_order ?? 0,
    });

    await manager.save(Product, product);
    return productDto(product, []);
  }

  async updateProduct(productId: string, dto: UpdateProductDto): Promise<ProductDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const product = await manager.findOne(Product, { where: { tenantId, id: productId } });
    if (!product) throw ApiException.notFound('Product');

    if (dto.category_id !== undefined) {
      // A moved category must still belong to the product's own merchant.
      if (dto.category_id) await this.assertCategory(product.merchantId, dto.category_id);
      product.categoryId = dto.category_id;
    }
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) product.description = dto.description?.trim() || null;
    if (dto.price_amount_cents !== undefined) product.priceAmountCents = dto.price_amount_cents;
    if (dto.image_url !== undefined) product.imageUrl = dto.image_url?.trim() || null;
    if (dto.status !== undefined) product.status = dto.status;
    if (dto.sort_order !== undefined) product.sortOrder = dto.sort_order;

    await manager.save(Product, product);
    return productDto(product, []);
  }

  async deleteProduct(productId: string): Promise<void> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const result = await manager.delete(Product, { tenantId, id: productId });
    if (!result.affected) throw ApiException.notFound('Product');
  }

  /* --------------------------------------------------- modifier groups */

  async createModifierGroup(
    productId: string,
    dto: CreateModifierGroupDto,
  ): Promise<ModifierGroupDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    await this.assertProduct(productId);
    const { min, max } = this.normalizeSelectionBounds(dto);

    const group = manager.create(ProductModifierGroup, {
      tenantId,
      productId,
      name: dto.name.trim(),
      selectionType: dto.selection_type,
      isRequired: dto.is_required ?? false,
      minSelections: min,
      maxSelections: max,
      sortOrder: dto.sort_order ?? 0,
    });

    // The DB CHECK constraints (pmg_*) are the real guardrails; a bad
    // combination surfaces here as a 422, not a 500.
    await this.saveChecked(() => manager.save(ProductModifierGroup, group));
    return groupDto(group, []);
  }

  async updateModifierGroup(
    groupId: string,
    dto: UpdateModifierGroupDto,
  ): Promise<ModifierGroupDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const group = await manager.findOne(ProductModifierGroup, { where: { tenantId, id: groupId } });
    if (!group) throw ApiException.notFound('Modifier group');

    if (dto.name !== undefined) group.name = dto.name.trim();
    if (dto.selection_type !== undefined) group.selectionType = dto.selection_type;
    if (dto.is_required !== undefined) group.isRequired = dto.is_required;
    if (dto.min_selections !== undefined) group.minSelections = dto.min_selections;
    if (dto.max_selections !== undefined) group.maxSelections = dto.max_selections;
    if (dto.sort_order !== undefined) group.sortOrder = dto.sort_order;

    if (group.selectionType === ModifierSelectionType.SINGLE) {
      group.maxSelections = 1;
      if (group.minSelections > 1) group.minSelections = group.isRequired ? 1 : 0;
    }

    await this.saveChecked(() => manager.save(ProductModifierGroup, group));

    const modifiers = await manager.find(ProductModifier, {
      where: { tenantId, groupId },
      order: { sortOrder: 'ASC' },
    });
    return groupDto(group, modifiers);
  }

  async deleteModifierGroup(groupId: string): Promise<void> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const result = await manager.delete(ProductModifierGroup, { tenantId, id: groupId });
    if (!result.affected) throw ApiException.notFound('Modifier group');
  }

  /* --------------------------------------------------------- modifiers */

  async createModifier(groupId: string, dto: CreateModifierDto): Promise<ModifierDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const group = await manager.findOne(ProductModifierGroup, { where: { tenantId, id: groupId } });
    if (!group) throw ApiException.notFound('Modifier group');

    const modifier = manager.create(ProductModifier, {
      tenantId,
      groupId,
      name: dto.name.trim(),
      deltaPriceCents: dto.delta_price_cents,
      isDefault: dto.is_default ?? false,
      isActive: dto.is_active ?? true,
      sortOrder: dto.sort_order ?? 0,
    });

    await manager.save(ProductModifier, modifier);
    return modifierDto(modifier);
  }

  async updateModifier(modifierId: string, dto: UpdateModifierDto): Promise<ModifierDto> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const modifier = await manager.findOne(ProductModifier, { where: { tenantId, id: modifierId } });
    if (!modifier) throw ApiException.notFound('Modifier');

    if (dto.name !== undefined) modifier.name = dto.name.trim();
    if (dto.delta_price_cents !== undefined) modifier.deltaPriceCents = dto.delta_price_cents;
    if (dto.is_default !== undefined) modifier.isDefault = dto.is_default;
    if (dto.is_active !== undefined) modifier.isActive = dto.is_active;
    if (dto.sort_order !== undefined) modifier.sortOrder = dto.sort_order;

    await manager.save(ProductModifier, modifier);
    return modifierDto(modifier);
  }

  async deleteModifier(modifierId: string): Promise<void> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const result = await manager.delete(ProductModifier, { tenantId, id: modifierId });
    if (!result.affected) throw ApiException.notFound('Modifier');
  }

  /* ----------------------------------------------------------- helpers */

  private normalizeSelectionBounds(dto: CreateModifierGroupDto): { min: number; max: number } {
    if (dto.selection_type === ModifierSelectionType.SINGLE) {
      // schema.sql pmg_single_chk: SINGLE groups pin max to 1 and min to 0/1.
      return { min: dto.is_required ? 1 : 0, max: 1 };
    }
    const min = dto.min_selections ?? (dto.is_required ? 1 : 0);
    const max = dto.max_selections ?? Math.max(1, min);
    return { min, max };
  }

  private async assertCategory(merchantId: string, categoryId: string): Promise<void> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    const exists = await manager.findOne(Category, {
      where: { tenantId, merchantId, id: categoryId },
    });
    if (!exists) {
      throw ApiException.validation('That category does not belong to this merchant.', {
        field: 'category_id',
      });
    }
  }

  private async assertProduct(productId: string): Promise<Product> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();
    const product = await manager.findOne(Product, { where: { tenantId, id: productId } });
    if (!product) throw ApiException.notFound('Product');
    return product;
  }

  /** Maps a 23505 unique_violation to a 409, everything else re-throws. */
  private async saveUnique<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw ApiException.conflict('DUPLICATE', message);
      }
      throw err;
    }
  }

  /** Maps a 23514 check_violation to a 422 rather than a 500. */
  private async saveChecked<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if ((err as { code?: string }).code === '23514') {
        throw ApiException.validation('Those modifier selection rules are not valid.');
      }
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ mapping */

function categoryDto(category: Category, products: ProductDto[]): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    sort_order: category.sortOrder,
    is_active: category.isActive,
    products,
  };
}

function productDto(product: Product, groups: ModifierGroupDto[]): ProductDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price_amount_cents: product.priceAmountCents,
    currency_code: product.currencyCode,
    status: product.status,
    image_url: product.imageUrl,
    sort_order: product.sortOrder,
    modifier_groups: groups,
  };
}

function groupDto(group: ProductModifierGroup, modifiers: ProductModifier[]): ModifierGroupDto {
  return {
    id: group.id,
    name: group.name,
    selection_type: group.selectionType,
    is_required: group.isRequired,
    min_selections: group.minSelections,
    max_selections: group.maxSelections,
    sort_order: group.sortOrder,
    modifiers: modifiers.map(modifierDto),
  };
}

function modifierDto(modifier: ProductModifier): ModifierDto {
  return {
    id: modifier.id,
    name: modifier.name,
    delta_price_cents: modifier.deltaPriceCents,
    is_default: modifier.isDefault,
    sort_order: modifier.sortOrder,
  };
}
