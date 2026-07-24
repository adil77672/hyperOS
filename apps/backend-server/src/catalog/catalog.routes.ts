import { Router } from 'express';
import { ApiException } from '../common/api-exception';
import { HttpStatus } from '../common/api-exception';
import { MERCHANT_DASHBOARD_ROLES } from '../common/roles';
import { RateLimits } from '../common/rate-limits';
import { Http } from '../framework/http';
import { parseBody, uuidParam } from '../framework/validation';
import { MerchantsService } from '../merchants/merchants.service';
import { CatalogService } from './catalog.service';
import { CatalogAdminService } from './catalog-admin.service';
import {
  CreateCategoryDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateMerchantSettingsDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
  UpdateProductDto,
} from './dto/catalog.dto';

/**
 * Merchant dashboard catalog CRUD + merchant settings
 * (API_AND_EVENT_CONTRACTS §8). Mounted at /api/v1/dashboard.
 *
 * Creation is merchant-scoped (`merchants/{id}/products`); mutation of an
 * existing resource is resource-scoped (`products/{id}`,
 * `modifier-groups/{id}/modifiers`) exactly as the spec lays the URLs out.
 */
export function catalogRoutes(
  http: Http,
  catalog: CatalogService,
  admin: CatalogAdminService,
  merchants: MerchantsService,
): Router {
  const router = Router();
  const read = { roles: MERCHANT_DASHBOARD_ROLES, rateLimit: RateLimits.dashboardRead } as const;
  const write = { roles: MERCHANT_DASHBOARD_ROLES, rateLimit: RateLimits.dashboardWrite } as const;
  const create = { ...write, idempotent: true, status: HttpStatus.CREATED } as const;
  const remove = { ...write, status: HttpStatus.NO_CONTENT } as const;

  /* ---------------------------------------------------------- merchant */

  router.get(
    '/merchants/:merchantId',
    http.route(read, async (req) => {
      const merchant = await merchants.assertAccess(uuidParam(req, 'merchantId'));
      return merchants.toDto(merchant);
    }),
  );

  router.patch(
    '/merchants/:merchantId',
    http.route(write, async (req) => {
      const merchant = await merchants.assertAccess(uuidParam(req, 'merchantId'));
      const dto = await parseBody(UpdateMerchantSettingsDto, req.body);
      return merchants.toDto(await merchants.updateSettings(merchant, dto));
    }),
  );

  router.get(
    '/merchants/:merchantId/menu',
    http.route(read, async (req) => {
      const merchantId = uuidParam(req, 'merchantId');
      await merchants.assertAccess(merchantId);
      // The dashboard sees inactive / archived rows the storefront hides.
      return catalog.getMenu(merchantId, { activeOnly: false });
    }),
  );

  /* -------------------------------------------------------- categories */

  router.post(
    '/merchants/:merchantId/categories',
    http.route(create, async (req) => {
      const merchantId = uuidParam(req, 'merchantId');
      await merchants.assertAccess(merchantId);
      return admin.createCategory(merchantId, await parseBody(CreateCategoryDto, req.body));
    }),
  );

  router.patch(
    '/categories/:categoryId',
    http.route(write, async (req) =>
      admin.updateCategory(uuidParam(req, 'categoryId'), await parseBody(UpdateCategoryDto, req.body)),
    ),
  );

  router.delete(
    '/categories/:categoryId',
    http.route(remove, async (req) => {
      await admin.deleteCategory(uuidParam(req, 'categoryId'));
      return undefined;
    }),
  );

  /* ---------------------------------------------------------- products */

  router.post(
    '/merchants/:merchantId/products',
    http.route(create, async (req) => {
      const merchantId = uuidParam(req, 'merchantId');
      await merchants.assertAccess(merchantId);
      const product = await admin.createProduct(merchantId, await parseBody(CreateProductDto, req.body));
      // §8.1: "Returns full product incl. empty modifier_groups array."
      const full = await catalog.getProduct(product.id, { activeOnly: false });
      if (!full) throw ApiException.notFound('Product');
      return full;
    }),
  );

  router.get(
    '/products/:productId',
    http.route(read, async (req) => {
      const product = await catalog.getProduct(uuidParam(req, 'productId'), { activeOnly: false });
      if (!product) throw ApiException.notFound('Product');
      return product;
    }),
  );

  router.patch(
    '/products/:productId',
    http.route(write, async (req) => {
      const productId = uuidParam(req, 'productId');
      await admin.updateProduct(productId, await parseBody(UpdateProductDto, req.body));
      const full = await catalog.getProduct(productId, { activeOnly: false });
      if (!full) throw ApiException.notFound('Product');
      return full;
    }),
  );

  router.delete(
    '/products/:productId',
    http.route(remove, async (req) => {
      await admin.deleteProduct(uuidParam(req, 'productId'));
      return undefined;
    }),
  );

  /* --------------------------------------------------- modifier groups */

  router.post(
    '/products/:productId/modifier-groups',
    http.route(create, async (req) =>
      admin.createModifierGroup(
        uuidParam(req, 'productId'),
        await parseBody(CreateModifierGroupDto, req.body),
      ),
    ),
  );

  router.patch(
    '/modifier-groups/:groupId',
    http.route(write, async (req) =>
      admin.updateModifierGroup(
        uuidParam(req, 'groupId'),
        await parseBody(UpdateModifierGroupDto, req.body),
      ),
    ),
  );

  router.delete(
    '/modifier-groups/:groupId',
    http.route(remove, async (req) => {
      await admin.deleteModifierGroup(uuidParam(req, 'groupId'));
      return undefined;
    }),
  );

  /* --------------------------------------------------------- modifiers */

  router.post(
    '/modifier-groups/:groupId/modifiers',
    http.route(create, async (req) =>
      admin.createModifier(uuidParam(req, 'groupId'), await parseBody(CreateModifierDto, req.body)),
    ),
  );

  router.patch(
    '/modifiers/:modifierId',
    http.route(write, async (req) =>
      admin.updateModifier(uuidParam(req, 'modifierId'), await parseBody(UpdateModifierDto, req.body)),
    ),
  );

  router.delete(
    '/modifiers/:modifierId',
    http.route(remove, async (req) => {
      await admin.deleteModifier(uuidParam(req, 'modifierId'));
      return undefined;
    }),
  );

  return router;
}
