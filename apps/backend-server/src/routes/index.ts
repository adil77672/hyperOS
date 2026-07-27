import type { Express } from 'express';
import { Container } from '../container';
import { tenantResolutionMiddleware } from '../tenancy/tenant-resolution.middleware';
import { healthRoutes } from '../health/health.routes';
import { authRoutes } from '../auth/auth.routes';
import { storefrontRoutes } from '../checkout/storefront.routes';
import { catalogRoutes } from '../catalog/catalog.routes';
import { orderRoutes } from '../orders/order.routes';
import { themeRoutes } from '../themes/theme.routes';
import { sseRoutes } from '../notifications/sse.routes';
import { platformRoutes } from '../platform/platform.routes';

/**
 * Barrel + mounting for every HTTP router in the app.
 *
 * These `*.routes.ts` factories are what used to be NestJS controllers — one
 * per resource area, each returning an Express `Router`. Re-exporting them here
 * gives a single import surface, and `mountRoutes` is the one place that fixes
 * their order onto the app.
 */
export {
  authRoutes,
  storefrontRoutes,
  catalogRoutes,
  orderRoutes,
  themeRoutes,
  sseRoutes,
  platformRoutes,
  healthRoutes,
};

/**
 * Mounts every router onto `app` in the required order:
 *
 *  1. /health          — before tenant resolution (no Host, no tenant yet).
 *  2. tenant middleware — establishes the request's AsyncLocalStorage context.
 *  3. /api/v1/*         — the tenant-scoped surface.
 *  4. error handler     — must be last, after all routes.
 *
 * Several dashboard routers share the /api/v1/dashboard base; Express tries
 * them in registration order and their paths do not overlap.
 */
export function mountRoutes(app: Express, c: Container): void {
  const { config } = c;

  app.use('/health', healthRoutes(c.appDataSource, c.redis));

  app.use(
    tenantResolutionMiddleware(c.resolver, c.sessions, c.jwt, {
      rootDomain: config.PLATFORM_ROOT_DOMAIN,
      dashboardHost: config.DASHBOARD_HOST,
      devFallbackSlug: config.DEV_FALLBACK_TENANT_SLUG,
      cookieSecure: config.COOKIE_SECURE,
    }),
  );

  app.use('/api/v1/auth', authRoutes(c.http, c.auth));

  app.use(
    '/api/v1/storefront',
    storefrontRoutes(c.http, {
      catalog: c.catalog,
      merchants: c.merchants,
      themes: c.themes,
      cart: c.cart,
      checkout: c.checkout,
      orders: c.orders,
      sessions: c.sessions,
      resolver: c.resolver,
    }),
  );

  app.use('/api/v1/dashboard/theme', themeRoutes(c.http, c.themes));
  app.use('/api/v1/dashboard', catalogRoutes(c.http, c.catalog, c.catalogAdmin, c.merchants));
  app.use('/api/v1/dashboard', orderRoutes(c.http, c.orders, c.merchants));
  app.use(
    '/api/v1/dashboard',
    sseRoutes(c.http, c.sse, c.merchants, c.appDataSource, config.SSE_HEARTBEAT_MS),
  );

  app.use('/api/v1/platform', platformRoutes(c.http, c.platform));

  // The single error exit point (replaces the Nest exception filter). Last.
  app.use(c.http.errorHandler());
}
