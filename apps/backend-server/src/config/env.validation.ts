import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Fail-fast environment contract. The app refuses to boot on a bad value
 * rather than discovering it at the first request.
 */
export class EnvironmentVariables {
  @IsString()
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /* ---------------------------------------------------------- database */

  @IsString() @IsNotEmpty()
  DATABASE_HOST: string = 'localhost';

  @IsInt() @Min(1) @Max(65535)
  DATABASE_PORT: number = 5432;

  @IsString() @IsNotEmpty()
  DATABASE_NAME: string = 'hyperzod';

  /** Non-BYPASSRLS role. Every request handler uses this connection pool. */
  @IsString() @IsNotEmpty()
  DATABASE_APP_USER: string = 'app_runtime';

  @IsString() @IsNotEmpty()
  DATABASE_APP_PASSWORD: string = 'app_runtime';

  /**
   * BYPASSRLS role. Used only by the control plane: tenant resolution by host
   * (which must read `tenants` before a tenant context exists) and signup
   * (which creates the tenant row itself).
   */
  @IsString() @IsNotEmpty()
  DATABASE_PLATFORM_USER: string = 'platform_admin';

  @IsString() @IsNotEmpty()
  DATABASE_PLATFORM_PASSWORD: string = 'platform_admin';

  @IsBoolean()
  DATABASE_SSL: boolean = false;

  /* ------------------------------------------------------------- redis */

  @IsString() @IsNotEmpty()
  REDIS_HOST: string = 'localhost';

  @IsInt() @Min(1) @Max(65535)
  REDIS_PORT: number = 6379;

  @IsOptional() @IsString()
  REDIS_PASSWORD?: string;

  @IsInt() @Min(0)
  REDIS_DB: number = 0;

  /* -------------------------------------------------------------- auth */

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET: string;

  @IsString() @IsNotEmpty()
  JWT_ISSUER: string = 'hyperzod-api';

  @IsString() @IsNotEmpty()
  JWT_AUDIENCE: string = 'hyperzod-dashboard';

  /** Seconds. API_AND_EVENT_CONTRACTS §2.3 specifies 12h. */
  @IsInt() @Min(60)
  JWT_ACCESS_TTL_SECONDS: number = 43_200;

  /** Seconds. 30-day refresh window (§2.3). */
  @IsInt() @Min(600)
  REFRESH_TTL_SECONDS: number = 2_592_000;

  /** Seconds. 30-day sliding customer session (MASTER_CONTEXT §4). */
  @IsInt() @Min(600)
  SESSION_TTL_SECONDS: number = 2_592_000;

  /* -------------------------------------------------------- multitenancy */

  /**
   * Storefronts resolve as `{slug}.{PLATFORM_ROOT_DOMAIN}` (MASTER_CONTEXT §5.1).
   */
  @IsString() @IsNotEmpty()
  PLATFORM_ROOT_DOMAIN: string = 'example.com';

  /** Single non-tenant hostname serving the merchant dashboard (§5.4). */
  @IsString() @IsNotEmpty()
  DASHBOARD_HOST: string = 'admin.example.com';

  /**
   * Escape hatch for local development, where `Host` is `localhost:3000` and
   * carries no subdomain. When set, unresolvable hosts fall back to this slug.
   */
  @IsOptional() @IsString()
  DEV_FALLBACK_TENANT_SLUG?: string;

  /** Image URLs in themes must live here (PRODUCT_MAPPING §4.2). */
  @IsString() @IsNotEmpty()
  PLATFORM_CDN_HOST: string = 'cdn.example.com';

  /* ------------------------------------------------------------- misc */

  @IsBoolean()
  COOKIE_SECURE: boolean = false;

  @IsInt() @Min(1)
  SSE_BUFFER_MAX_EVENTS: number = 200;

  @IsInt() @Min(1000)
  SSE_HEARTBEAT_MS: number = 15_000;

  @IsBoolean()
  RATE_LIMIT_ENABLED: boolean = true;
}

const BOOLEAN_KEYS = new Set([
  'DATABASE_SSL',
  'COOKIE_SECURE',
  'RATE_LIMIT_ENABLED',
]);

const NUMBER_KEYS = new Set([
  'PORT',
  'DATABASE_PORT',
  'REDIS_PORT',
  'REDIS_DB',
  'JWT_ACCESS_TTL_SECONDS',
  'REFRESH_TTL_SECONDS',
  'SESSION_TTL_SECONDS',
  'SSE_BUFFER_MAX_EVENTS',
  'SSE_HEARTBEAT_MS',
]);

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const coerced: Record<string, unknown> = { ...raw };

  for (const key of Object.keys(coerced)) {
    const value = coerced[key];
    if (typeof value !== 'string') continue;
    if (BOOLEAN_KEYS.has(key)) {
      coerced[key] = value.toLowerCase() === 'true' || value === '1';
    } else if (NUMBER_KEYS.has(key)) {
      const parsed = Number(value);
      coerced[key] = Number.isNaN(parsed) ? value : parsed;
    }
  }

  const config = plainToInstance(EnvironmentVariables, coerced, {
    exposeDefaultValues: true,
    enableImplicitConversion: false,
  });

  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return config;
}
