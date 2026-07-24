import { Router } from 'express';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { StorefrontBootstrapDto } from '@hyperzod/shared-types';
import { ApiException, HttpStatus } from '../common/api-exception';
import { RateLimits } from '../common/rate-limits';
import { Http } from '../framework/http';
import { withMeta } from '../framework/envelope';
import { parseBody, queryString, uuidParam } from '../framework/validation';
import { CatalogService } from '../catalog/catalog.service';
import { MerchantsService } from '../merchants/merchants.service';
import { OrdersService } from '../orders/orders.service';
import { SessionService } from '../auth/session.service';
import { ThemesService } from '../themes/themes.service';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantResolverService } from '../tenancy/tenant-resolver.service';
import { CartService } from './cart.service';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, ReplaceCartDto } from './dto/checkout.dto';

export interface StorefrontDeps {
  catalog: CatalogService;
  merchants: MerchantsService;
  themes: ThemesService;
  cart: CartService;
  checkout: CheckoutService;
  orders: OrdersService;
  sessions: SessionService;
  resolver: TenantResolverService;
}

/**
 * The public customer surface (API_AND_EVENT_CONTRACTS §3–4). Mounted at
 * /api/v1/storefront.
 *
 * No dashboard JWT — the tenant comes from the Host and the session from the
 * hzsid cookie, both established in tenantResolutionMiddleware. State-changing
 * routes carry `csrf: true` (double-submit token) and tight rate limits.
 */
export function storefrontRoutes(http: Http, deps: StorefrontDeps): Router {
  const router = Router();

  /* --------------------------------------------------------- bootstrap */

  router.get(
    '/bootstrap',
    http.route({ rateLimit: RateLimits.storefrontRead }, async (): Promise<StorefrontBootstrapDto> => {
      const ctx = TenantContext.require();
      const tenantId = TenantContext.requireTenantId();

      const tenant = await deps.resolver.findById(tenantId);
      if (!tenant) throw ApiException.notFound('Storefront');

      const merchant = await deps.merchants.findStorefrontMerchant();
      const theme = await deps.themes.get();
      const session = ctx.sessionId ? await deps.sessions.get(ctx.sessionId) : null;

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          default_currency_code: tenant.defaultCurrencyCode,
          default_locale: tenant.defaultLocale,
          timezone: tenant.timezone,
        },
        merchant: merchant ? deps.merchants.toDto(merchant) : null,
        theme,
        session: { id: ctx.sessionId ?? '', csrf_token: session?.csrf ?? '' },
      };
    }),
  );

  /* -------------------------------------------------------------- menu */

  router.get(
    '/menu',
    http.route({ rateLimit: RateLimits.storefrontRead }, async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');

      const merchant = await deps.merchants.findStorefrontMerchant();
      if (!merchant) throw ApiException.notFound('Menu');

      const updatedAt = await deps.catalog.menuUpdatedAt(merchant.id);
      const etag = `"menu-${createHash('sha1')
        .update(`${merchant.id}:${updatedAt?.toISOString() ?? 'empty'}`)
        .digest('hex')
        .slice(0, 16)}"`;

      // ETag revalidation: an unchanged menu costs a 304, not a re-serialize.
      if (req.headers['if-none-match'] === etag) {
        res.status(HttpStatus.NOT_MODIFIED);
        return undefined;
      }

      res.setHeader('ETag', etag);
      const menu = await deps.catalog.getMenu(merchant.id, { activeOnly: true });
      return withMeta(menu, { menu_updated_at: updatedAt?.toISOString() ?? null });
    }),
  );

  router.get(
    '/products/:productId',
    http.route({ rateLimit: RateLimits.storefrontRead }, async (req) => {
      const product = await deps.catalog.getProduct(uuidParam(req, 'productId'), { activeOnly: true });
      if (!product) throw ApiException.notFound('Product');
      return product;
    }),
  );

  /* -------------------------------------------------------------- cart */

  router.get('/cart', http.route({ rateLimit: RateLimits.storefrontRead }, () => deps.cart.get()));

  router.put(
    '/cart',
    http.route({ csrf: true, rateLimit: RateLimits.storefrontCart }, async (req) => {
      const dto = await parseBody(ReplaceCartDto, req.body);
      return deps.cart.replace(
        dto.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          selected_modifier_ids: i.selected_modifier_ids ?? [],
          notes: i.notes ?? null,
        })),
      );
    }),
  );

  /* ---------------------------------------------------------- checkout */

  router.post(
    '/checkout',
    http.route(
      { csrf: true, idempotent: true, rateLimit: RateLimits.storefrontCheckout, status: HttpStatus.CREATED },
      async (req) => {
        const dto = await parseBody(CheckoutDto, req.body);
        const { order } = await deps.checkout.placeOrder(dto);
        return { order };
      },
    ),
  );

  /* ------------------------------------------------------ order status */

  router.get(
    '/orders/:orderId',
    http.route({ rateLimit: RateLimits.storefrontRead }, async (req) => {
      const orderId = uuidParam(req, 'orderId');

      // Two ways in (§4.4): the one-time email token, or the session that
      // placed the order. Anything else is a bare 404 — an order id must not
      // be a lookup oracle for someone who has neither.
      let authorized = await deps.checkout.sessionPlacedOrder(orderId);

      const token = queryString(req, 'token');
      if (!authorized && token) {
        const resolved = await deps.checkout.resolveViewToken(token);
        const tenantId = TenantContext.get()?.tenantId;
        authorized = !!resolved && resolved.orderId === orderId && resolved.tenantId === tenantId;
      }

      if (!authorized) throw ApiException.notFound();

      const order = await deps.orders.findById(orderId);
      if (!order) throw ApiException.notFound();
      return { order };
    }),
  );

  return router;
}
