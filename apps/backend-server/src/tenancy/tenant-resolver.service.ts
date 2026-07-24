import { DataSource } from 'typeorm';
import { CustomDomainStatus, TenantStatus } from '@hyperzod/shared-types';
import { RedisService } from '../redis/redis.service';

export interface ResolvedTenant {
  id: string;
  slug: string;
  status: TenantStatus;
  defaultCurrencyCode: string;
  defaultLocale: string;
  timezone: string;
  name: string;
}

const CACHE_TTL_SECONDS = 300; // PRODUCT_MAPPING §6: tenant:by-domain 5m
const NEGATIVE_CACHE_SENTINEL = '-';

/**
 * Resolves a `Host` header to a tenant.
 *
 * Runs on the BYPASSRLS pool by necessity: `tenants` is protected by
 * `tenant_self_visibility (id = current_tenant_id())`, and we are trying to
 * discover the tenant id in the first place. This is the only read path
 * allowed to do that, and it selects a fixed, non-sensitive column list.
 */
export class TenantResolverService {
  constructor(
    private readonly platformDs: DataSource,
    private readonly redis: RedisService,
  ) {}

  async resolveByHost(host: string, rootDomain: string): Promise<ResolvedTenant | null> {
    const hostname = normalizeHost(host);
    if (!hostname) return null;

    const cacheKey = `tenant:by-domain:${hostname}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached === NEGATIVE_CACHE_SENTINEL) return null;
    if (cached) {
      try {
        return JSON.parse(cached) as ResolvedTenant;
      } catch {
        // Corrupt entry — fall through and re-resolve.
      }
    }

    const slug = extractSubdomain(hostname, rootDomain);
    const tenant = slug
      ? await this.findBySlug(slug)
      : await this.findByCustomDomain(hostname);

    await this.redis.client.set(
      cacheKey,
      tenant ? JSON.stringify(tenant) : NEGATIVE_CACHE_SENTINEL,
      'EX',
      CACHE_TTL_SECONDS,
    );

    return tenant;
  }

  async findBySlug(slug: string): Promise<ResolvedTenant | null> {
    const rows = await this.platformDs.query(
      `SELECT id, slug, status, default_currency_code, default_locale, timezone, name
         FROM tenants
        WHERE slug = $1 AND status = 'ACTIVE'
        LIMIT 1`,
      [slug],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findById(tenantId: string): Promise<ResolvedTenant | null> {
    const rows = await this.platformDs.query(
      `SELECT id, slug, status, default_currency_code, default_locale, timezone, name
         FROM tenants
        WHERE id = $1 AND status = 'ACTIVE'
        LIMIT 1`,
      [tenantId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** MASTER_CONTEXT §5.2 — Mode B, exact hostname match. Phase 2. */
  private async findByCustomDomain(hostname: string): Promise<ResolvedTenant | null> {
    const rows = await this.platformDs.query(
      `SELECT t.id, t.slug, t.status, t.default_currency_code, t.default_locale,
              t.timezone, t.name
         FROM tenant_custom_domains d
         JOIN tenants t ON t.id = d.tenant_id
        WHERE d.hostname = $1
          AND d.status = $2
          AND t.status = 'ACTIVE'
        LIMIT 1`,
      [hostname, CustomDomainStatus.ACTIVE],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async invalidateHost(hostname: string): Promise<void> {
    await this.redis.client.del(`tenant:by-domain:${normalizeHost(hostname)}`);
  }
}

function mapRow(row: Record<string, any>): ResolvedTenant {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    defaultCurrencyCode: row.default_currency_code,
    defaultLocale: row.default_locale,
    timezone: row.timezone,
    name: row.name,
  };
}

/** Strips the port and lowercases. IPv6 literals are not tenant hosts. */
export function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith('[')) return '';
  const withoutPort = trimmed.split(':')[0] ?? '';
  return withoutPort;
}

/**
 * `cheesyone.example.com` + `example.com` -> `cheesyone`.
 * Returns null when the host is not a subdomain of the platform root, when it
 * is the bare root, or when the label is a reserved platform subdomain.
 */
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'api', 'cdn', 'assets', 'static']);

export function extractSubdomain(hostname: string, rootDomain: string): string | null {
  const root = rootDomain.toLowerCase();
  if (hostname === root) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const label = hostname.slice(0, -(root.length + 1));
  // Only a single label is a tenant slug; `a.b.example.com` is not.
  if (!label || label.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}
