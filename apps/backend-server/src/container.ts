import { DataSource } from 'typeorm';
import { EnvironmentVariables } from './config/env.validation';
import { createAppDataSource, createPlatformDataSource } from './database/data-source';
import { RedisService } from './redis/redis.service';
import { EventBus } from './framework/event-bus';
import { Http } from './framework/http';
import { JwtService } from './auth/jwt.service';
import { SessionService } from './auth/session.service';
import { AuthService } from './auth/auth.service';
import { TenantResolverService } from './tenancy/tenant-resolver.service';
import { MerchantsService } from './merchants/merchants.service';
import { ThemesService } from './themes/themes.service';
import { CatalogService } from './catalog/catalog.service';
import { CatalogAdminService } from './catalog/catalog-admin.service';
import { OrdersService } from './orders/orders.service';
import { CartService } from './checkout/cart.service';
import { CheckoutService } from './checkout/checkout.service';
import { MerchantSseService } from './notifications/merchant-sse.service';
import { PlatformService } from './platform/platform.service';

/**
 * The composition root — hand-wired dependency graph that replaces the NestJS
 * DI container.
 *
 * Everything is a singleton, constructed once in dependency order and held on
 * this object. There is no reflection, no decorator metadata, no runtime module
 * resolution: the wiring is this file, top to bottom, and a missing dependency
 * is a compile error rather than a startup surprise.
 *
 * Two DB pools, per MASTER_CONTEXT §3.3:
 *   - `app`      (NOBYPASSRLS) — every request handler, RLS enforced;
 *   - `platform` (BYPASSRLS)   — host→tenant resolution and signup only.
 */
export interface Container {
  config: EnvironmentVariables;
  appDataSource: DataSource;
  platformDataSource: DataSource;
  redis: RedisService;
  eventBus: EventBus;
  http: Http;

  jwt: JwtService;
  sessions: SessionService;
  auth: AuthService;
  resolver: TenantResolverService;
  merchants: MerchantsService;
  themes: ThemesService;
  catalog: CatalogService;
  catalogAdmin: CatalogAdminService;
  orders: OrdersService;
  cart: CartService;
  checkout: CheckoutService;
  sse: MerchantSseService;
  platform: PlatformService;

  shutdown: () => Promise<void>;
}

export async function buildContainer(config: EnvironmentVariables): Promise<Container> {
  /* ------------------------------------------------------ infrastructure */

  const appDataSource = createAppDataSource({
    host: config.DATABASE_HOST,
    port: config.DATABASE_PORT,
    database: config.DATABASE_NAME,
    username: config.DATABASE_APP_USER,
    password: config.DATABASE_APP_PASSWORD,
    ssl: config.DATABASE_SSL,
  });

  const platformDataSource = createPlatformDataSource({
    host: config.DATABASE_HOST,
    port: config.DATABASE_PORT,
    database: config.DATABASE_NAME,
    username: config.DATABASE_PLATFORM_USER,
    password: config.DATABASE_PLATFORM_PASSWORD,
    ssl: config.DATABASE_SSL,
  });

  await appDataSource.initialize();
  await platformDataSource.initialize();

  const redis = new RedisService({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    db: config.REDIS_DB,
  });

  const eventBus = new EventBus();

  const jwt = new JwtService({
    secret: config.JWT_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  const sessions = new SessionService(redis, config.SESSION_TTL_SECONDS);

  /* -------------------------------------------------------------- services */

  const auth = new AuthService(platformDataSource, jwt, redis, {
    accessTtlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
  });

  const resolver = new TenantResolverService(platformDataSource, redis);
  const merchants = new MerchantsService();
  const themes = new ThemesService(config.PLATFORM_CDN_HOST);
  const catalog = new CatalogService();
  const catalogAdmin = new CatalogAdminService();
  const orders = new OrdersService();
  const cart = new CartService(redis, catalog);
  const checkout = new CheckoutService(catalog, merchants, cart, redis);

  const sse = new MerchantSseService(redis, eventBus, config.SSE_BUFFER_MAX_EVENTS);
  // Subscribe to domain events + open the Redis subscriber connection.
  sse.init();

  const platform = new PlatformService(platformDataSource, config.PLATFORM_ROOT_DOMAIN);

  /* ------------------------------------------------------------ http kernel */

  const http = new Http({
    redis,
    sessions,
    appDataSource,
    eventBus,
    rateLimitEnabled: config.RATE_LIMIT_ENABLED,
    isProduction: config.NODE_ENV === 'production',
  });

  /* -------------------------------------------------------------- shutdown */

  const shutdown = async (): Promise<void> => {
    await Promise.allSettled([
      appDataSource.destroy(),
      platformDataSource.destroy(),
      redis.close(),
    ]);
  };

  return {
    config,
    appDataSource,
    platformDataSource,
    redis,
    eventBus,
    http,
    jwt,
    sessions,
    auth,
    resolver,
    merchants,
    themes,
    catalog,
    catalogAdmin,
    orders,
    cart,
    checkout,
    sse,
    platform,
    shutdown,
  };
}
