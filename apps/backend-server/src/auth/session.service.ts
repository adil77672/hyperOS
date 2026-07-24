import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis-keys';

export interface SessionRecord {
  id: string;
  tenantId: string;
  userId?: string;
  csrf: string;
  createdAt: string;
  lastSeenAt: string;
}

export const SESSION_COOKIE = 'hzsid';

/**
 * Redis-backed storefront sessions (MASTER_CONTEXT §4).
 *
 * Anonymous by design: a customer builds a cart with no account, and the
 * session is the only identity until guest checkout supplies contact details.
 */
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly ttlSeconds: number,
  ) {}

  async create(tenantId: string): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: randomUUID(),
      tenantId,
      csrf: randomUUID(),
      createdAt: now,
      lastSeenAt: now,
    };
    await this.persist(record);
    return record;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.client.get(RedisKeys.session(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  /**
   * Loads the session named by the cookie, but only if it was created under
   * this tenant. A session presented on a different tenant's storefront is
   * discarded and replaced — cookies are per-registrable-domain, so a shared
   * platform root domain would otherwise let one tenant's cookie address
   * another tenant's session.
   */
  async resolveForTenant(
    sessionId: string | undefined,
    tenantId: string,
  ): Promise<{ session: SessionRecord; isNew: boolean }> {
    if (sessionId) {
      const existing = await this.get(sessionId);
      if (existing && existing.tenantId === tenantId) {
        existing.lastSeenAt = new Date().toISOString();
        await this.persist(existing); // sliding TTL
        return { session: existing, isNew: false };
      }
    }
    return { session: await this.create(tenantId), isNew: true };
  }

  async attachUser(sessionId: string, userId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    session.userId = userId;
    await this.persist(session);
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.client.del(RedisKeys.session(sessionId));
  }

  private async persist(record: SessionRecord): Promise<void> {
    await this.redis.client.set(
      RedisKeys.session(record.id),
      JSON.stringify(record),
      'EX',
      this.ttlSeconds,
    );
  }

  get cookieMaxAgeMs(): number {
    return this.ttlSeconds * 1000;
  }
}
