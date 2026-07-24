import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AuthSessionDto,
  MerchantStatus,
  TenantStatus,
  UserRole,
} from '@hyperzod/shared-types';
import { ApiException, HttpStatus } from '../common/api-exception';
import { Logger } from '../common/logger';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis-keys';
import { JwtService } from './jwt.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { burnPasswordComparison, hashPassword, verifyPassword } from './password';

export interface AuthTokenConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

interface RefreshRecord {
  userId: string;
  tenantId: string;
  issuedAt: string;
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  password_hash: string | null;
  tenant_status: TenantStatus;
  tenant_slug: string;
}

/**
 * Dashboard authentication (API_AND_EVENT_CONTRACTS §2.3–2.6).
 *
 * Runs on the BYPASSRLS platform pool throughout, and it must: login has to
 * find a user before any tenant is known, and signup creates the tenant row
 * itself. Every query here therefore filters explicitly and returns a fixed
 * column list — the usual RLS safety net is not underneath it.
 */
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly platformDs: DataSource,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly tokenConfig: AuthTokenConfig,
  ) {}

  /* -------------------------------------------------------------- login */

  async login(dto: LoginDto): Promise<AuthSessionDto> {
    const candidates: UserRow[] = await this.platformDs.query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active,
              u.password_hash, t.status AS tenant_status, t.slug AS tenant_slug
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
        WHERE u.email = $1
          AND u.role <> 'CUSTOMER'
          AND ($2::citext IS NULL OR t.slug = $2::citext)`,
      [dto.email, dto.tenant_slug ?? null],
    );

    if (candidates.length === 0) {
      // Spend the same CPU we would have on a real hash, then return the same
      // 401 as a wrong password. §2.3: "intentionally identical whether the
      // email exists or not."
      await burnPasswordComparison();
      throw ApiException.unauthenticated('Invalid email or password.');
    }

    const matched: UserRow[] = [];
    for (const candidate of candidates) {
      if (await verifyPassword(dto.password, candidate.password_hash)) {
        matched.push(candidate);
      }
    }

    if (matched.length === 0) {
      throw ApiException.unauthenticated('Invalid email or password.');
    }

    if (matched.length > 1) {
      // The same address and password at more than one tenant. Only reachable
      // by someone who already knows the password, so naming the tenants they
      // can choose from leaks nothing they could not already discover.
      throw new ApiException(
        'TENANT_SELECTION_REQUIRED',
        'This email is registered at more than one business. Retry with tenant_slug.',
        HttpStatus.CONFLICT,
        { tenant_slugs: matched.map((m) => m.tenant_slug) },
      );
    }

    const user = matched[0]!;

    if (!user.is_active) {
      throw ApiException.forbidden('This account has been deactivated.');
    }
    if (user.tenant_status !== TenantStatus.ACTIVE) {
      throw ApiException.forbidden('This business account is not active.');
    }

    await this.platformDs.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [
      user.id,
    ]);

    return this.issueSession(user);
  }

  /* ------------------------------------------------------------ refresh */

  async refresh(refreshToken: string): Promise<AuthSessionDto> {
    const key = RedisKeys.refreshToken(refreshToken);

    // Single-use: the read and the delete are one atomic step, so two
    // concurrent refreshes cannot both mint a new pair.
    const raw = await this.redis.client.getdel(key);
    if (!raw) {
      throw ApiException.unauthenticated('Invalid or expired refresh token.');
    }

    let record: RefreshRecord;
    try {
      record = JSON.parse(raw) as RefreshRecord;
    } catch {
      throw ApiException.unauthenticated('Invalid refresh token.');
    }

    const rows: UserRow[] = await this.platformDs.query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active,
              u.password_hash, t.status AS tenant_status, t.slug AS tenant_slug
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1 AND u.tenant_id = $2
        LIMIT 1`,
      [record.userId, record.tenantId],
    );

    const user = rows[0];
    if (!user || !user.is_active || user.tenant_status !== TenantStatus.ACTIVE) {
      throw ApiException.unauthenticated('Invalid refresh token.');
    }

    return this.issueSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.redis.client.del(RedisKeys.refreshToken(refreshToken));
  }

  /* ------------------------------------------------------------- signup */

  /**
   * Merchant onboarding (§2.6). One transaction creates the tenant, its theme,
   * the owner user and a starter merchant — a partial signup would leave an
   * unreachable storefront, so all five steps commit together or none do.
   */
  async signup(dto: SignupDto): Promise<AuthSessionDto> {
    const passwordHash = await hashPassword(dto.owner_password);
    const currency = dto.default_currency_code ?? 'AUD';
    const timezone = dto.timezone ?? 'Australia/Sydney';
    const locale = dto.default_locale ?? 'en-AU';

    const runner = this.platformDs.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const existing = await runner.query(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [
        dto.storefront_slug,
      ]);
      if (existing.length > 0) {
        throw ApiException.validation('That storefront address is already taken.', {
          field: 'storefront_slug',
        });
      }

      const [tenant] = await runner.query(
        `INSERT INTO tenants
           (name, slug, status, default_currency_code, default_locale, timezone, contact_email)
         VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6)
         RETURNING id, slug`,
        [dto.business_name, dto.storefront_slug, currency, locale, timezone, dto.owner_email],
      );

      // Column defaults supply the whole starter palette (schema.sql §4).
      await runner.query(`INSERT INTO tenant_themes (tenant_id) VALUES ($1)`, [tenant.id]);

      const [user] = await runner.query(
        `INSERT INTO users
           (tenant_id, email, phone, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'TENANT_ADMIN', true)
         RETURNING id, tenant_id, email, full_name, role`,
        [
          tenant.id,
          dto.owner_email,
          dto.contact_phone ?? null,
          passwordHash,
          dto.owner_full_name,
        ],
      );

      // Starter merchant is ACTIVE, not the column default PENDING_APPROVAL:
      // KYC is Phase 2 (PRODUCT_MAPPING §1.1), and a pending merchant would
      // leave the storefront with nothing to render right after signup.
      await runner.query(
        `INSERT INTO merchants
           (tenant_id, owner_user_id, name, slug, status, contact_phone, accepting_orders)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [
          tenant.id,
          user.id,
          dto.business_name,
          dto.storefront_slug,
          MerchantStatus.ACTIVE,
          dto.contact_phone ?? null,
        ],
      );

      await runner.commitTransaction();

      // TODO(Phase 1, blocked): send the verification email once the provider
      // is chosen. MASTER_CONTEXT §9 lists it as [TBD region-dependent].
      this.logger.log(`tenant "${tenant.slug}" provisioned (${tenant.id})`);

      return this.issueSession({
        id: user.id,
        tenant_id: tenant.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: true,
        password_hash: null,
        tenant_status: TenantStatus.ACTIVE,
        tenant_slug: tenant.slug,
      });
    } catch (err) {
      await runner.rollbackTransaction().catch(() => undefined);
      if (err instanceof ApiException) throw err;

      // 23505 = unique_violation. The slug pre-check above narrows the window
      // but does not close it; two concurrent signups can still collide.
      if (isUniqueViolation(err)) {
        throw ApiException.validation('That storefront address is already taken.', {
          field: 'storefront_slug',
        });
      }
      throw err;
    } finally {
      await runner.release();
    }
  }

  /* ------------------------------------------------------------ helpers */

  private async issueSession(user: UserRow): Promise<AuthSessionDto> {
    const expiresIn = this.tokenConfig.accessTtlSeconds;

    // Issuer/audience live inside JwtService now, not on each call site.
    const accessToken = this.jwt.sign({
      subject: user.id,
      expiresInSeconds: expiresIn,
      tenantId: user.tenant_id,
      role: user.role,
    });

    const refreshToken = randomBytes(32).toString('base64url');
    const record: RefreshRecord = {
      userId: user.id,
      tenantId: user.tenant_id,
      issuedAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      RedisKeys.refreshToken(refreshToken),
      JSON.stringify(record),
      'EX',
      this.tokenConfig.refreshTtlSeconds,
    );

    return {
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
