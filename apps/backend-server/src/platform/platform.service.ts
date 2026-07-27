import { DataSource } from 'typeorm';
import { TenantStatus } from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';

export interface PlatformTenantDto {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  default_currency_code: string;
  default_locale: string;
  timezone: string;
  contact_email: string | null;
  /**
   * The tenant's live storefront address, `{slug}.{platform-root-domain}`
   * (MASTER_CONTEXT §5.1). This is the "each admin has their own store domain"
   * the super-admin sees, e.g. `cheesious.hyperos.co`.
   */
  storefront_domain: string;
  created_at: string;
  merchant_count: number;
  order_count: number;
}

/**
 * Super-admin control plane. Always runs on the BYPASSRLS platform pool —
 * these queries intentionally cross every tenant.
 */
export class PlatformService {
  constructor(
    private readonly platformDs: DataSource,
    private readonly rootDomain: string,
  ) {}

  async listTenants(): Promise<PlatformTenantDto[]> {
    const rows: Array<Record<string, unknown>> = await this.platformDs.query(
      `SELECT t.id, t.name, t.slug, t.status, t.default_currency_code, t.default_locale,
              t.timezone, t.contact_email, t.created_at,
              (SELECT COUNT(*)::int FROM merchants m WHERE m.tenant_id = t.id) AS merchant_count,
              (SELECT COUNT(*)::int FROM orders o WHERE o.tenant_id = t.id) AS order_count
         FROM tenants t
        WHERE t.slug <> 'platform'
        ORDER BY t.created_at DESC`,
    );
    return rows.map((r) => this.toDto(r));
  }

  async getTenant(tenantId: string): Promise<PlatformTenantDto> {
    const rows: Array<Record<string, unknown>> = await this.platformDs.query(
      `SELECT t.id, t.name, t.slug, t.status, t.default_currency_code, t.default_locale,
              t.timezone, t.contact_email, t.created_at,
              (SELECT COUNT(*)::int FROM merchants m WHERE m.tenant_id = t.id) AS merchant_count,
              (SELECT COUNT(*)::int FROM orders o WHERE o.tenant_id = t.id) AS order_count
         FROM tenants t
        WHERE t.id = $1 AND t.slug <> 'platform'`,
      [tenantId],
    );
    if (!rows[0]) throw ApiException.notFound('Tenant');
    return this.toDto(rows[0]);
  }

  async setTenantStatus(tenantId: string, status: TenantStatus): Promise<PlatformTenantDto> {
    if (status === TenantStatus.CANCELLED) {
      // Soft-cancel only; hard delete is out of scope.
    }
    const result = await this.platformDs.query(
      `UPDATE tenants SET status = $2, updated_at = now()
        WHERE id = $1 AND slug <> 'platform'
        RETURNING id`,
      [tenantId, status],
    );
    if (!result[0]) throw ApiException.notFound('Tenant');
    return this.getTenant(tenantId);
  }

  private toDto(row: Record<string, unknown>): PlatformTenantDto {
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      status: row.status as TenantStatus,
      default_currency_code: String(row.default_currency_code),
      default_locale: String(row.default_locale),
      timezone: String(row.timezone),
      contact_email: (row.contact_email as string | null) ?? null,
      storefront_domain: `${String(row.slug)}.${this.rootDomain}`,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      merchant_count: Number(row.merchant_count ?? 0),
      order_count: Number(row.order_count ?? 0),
    };
  }
}
