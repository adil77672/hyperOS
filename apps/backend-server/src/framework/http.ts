import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  ApiErrorCode,
  ApiErrorResponse,
  UserRole,
} from '@hyperzod/shared-types';
import { ApiException, HttpStatus } from '../common/api-exception';
import { RateLimitConfig } from '../common/rate-limits';
import { RedisKeys } from '../redis/redis-keys';
import { RedisService } from '../redis/redis.service';
import { SessionService } from '../auth/session.service';
import { TenantContext } from '../tenancy/tenant-context';
import { EventBus } from './event-bus';
import { EnvelopedResponse } from './envelope';

export interface RouteOptions {
  /** Require a valid dashboard JWT (verified upstream in tenant middleware). */
  auth?: boolean;
  /** Restrict to these roles (implies auth). Accepts `as const` tuples too. */
  roles?: readonly UserRole[];
  /** Enforce double-submit CSRF for storefront sessions. */
  csrf?: boolean;
  rateLimit?: RateLimitConfig;
  /** Honour the Idempotency-Key header (§11). */
  idempotent?: boolean;
  /** Skip the per-request RLS transaction (auth routes, health, SSE). */
  skipRlsTx?: boolean;
  /** Handler writes the response itself (SSE); skip envelope + tx. */
  raw?: boolean;
  /** Success status code. Default 200. */
  status?: number;
}

export type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

interface HttpDeps {
  redis: RedisService;
  sessions: SessionService;
  appDataSource: DataSource;
  eventBus: EventBus;
  rateLimitEnabled: boolean;
  isProduction: boolean;
}

const IDEMPOTENCY_TTL = 86_400; // 24h (§11)
const IDEMPOTENCY_IN_FLIGHT = '__in_flight__';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The HTTP kernel: one object that wraps a handler with every cross-cutting
 * concern the NestJS guard + interceptor stack used to provide, in explicit,
 * readable order.
 *
 * Pipeline per request (outermost first):
 *   rate limit -> auth -> roles -> csrf -> idempotency claim
 *     -> RLS transaction (BEGIN; SET LOCAL app.current_tenant; ... COMMIT)
 *       -> handler
 *     -> flush buffered domain events (post-commit)
 *   -> envelope { data, meta } -> send (+ store idempotent response)
 */
export class Http {
  constructor(private readonly deps: HttpDeps) {}

  /** Wraps a handler into an Express RequestHandler. */
  route(options: RouteOptions, handler: Handler): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      this.run(options, handler, req, res).catch(next);
    };
  }

  private async run(
    options: RouteOptions,
    handler: Handler,
    req: Request,
    res: Response,
  ): Promise<void> {
    if (options.rateLimit) await this.checkRateLimit(options.rateLimit, req);
    if (options.auth || options.roles?.length) this.checkAuth();
    if (options.roles?.length) this.checkRoles(options.roles);
    if (options.csrf) await this.checkCsrf(req);

    const idemKey = options.idempotent ? this.idempotencyKey(req) : null;
    let claimed = false;

    if (idemKey) {
      const replay = await this.idempotentReplay(idemKey);
      if (replay.kind === 'hit') {
        this.sendStored(res, replay.status, replay.body);
        return;
      }
      claimed = true;
    }

    try {
      const ctx = TenantContext.get();
      const useTx = !options.raw && !options.skipRlsTx && !!ctx?.tenantId;

      const result = useTx
        ? await this.runInRlsTransaction(ctx!.tenantId!, () => handler(req, res))
        : await handler(req, res);

      if (options.raw) return; // SSE / manual response already written

      const status = options.status ?? HttpStatus.OK;
      const body = envelopeBody(result);

      if (idemKey && claimed) await this.storeIdempotent(idemKey, status, body);
      this.sendStored(res, status, body);
    } catch (err) {
      // Release the claim so a genuine retry after a failure can proceed.
      if (idemKey && claimed) await this.deps.redis.client.del(idemKey).catch(() => undefined);
      throw err;
    }
  }

  /* ---------------------------------------------------------- guards */

  private checkAuth(): void {
    const ctx = TenantContext.get();
    if (!ctx?.userId || !ctx.tenantId || !ctx.role) {
      throw ApiException.unauthenticated();
    }
  }

  private checkRoles(roles: readonly UserRole[]): void {
    const role = TenantContext.get()?.role;
    if (!role) throw ApiException.unauthenticated();
    if (!roles.includes(role)) throw ApiException.forbidden();
  }

  /**
   * Double-submit CSRF for session-authenticated storefront writes
   * (MASTER_CONTEXT §4). JWT dashboard requests are exempt: the token rides an
   * Authorization header a cross-site form cannot set.
   */
  private async checkCsrf(req: Request): Promise<void> {
    if (SAFE_METHODS.has(req.method)) return;

    const ctx = TenantContext.get();
    if (ctx?.mode !== 'storefront') return;
    if (!ctx.sessionId) throw ApiException.forbidden('No session.');

    const submitted = req.headers[CSRF_HEADER];
    if (typeof submitted !== 'string' || submitted.length === 0) {
      throw ApiException.forbidden('Missing CSRF token.');
    }

    const session = await this.deps.sessions.get(ctx.sessionId);
    if (!session) throw ApiException.forbidden('Session expired.');
    if (!constantTimeEquals(submitted, session.csrf)) {
      throw ApiException.forbidden('Invalid CSRF token.');
    }
  }

  /**
   * Fixed-window rate limit per (tenant, group, identifier). Admits up to 2x
   * the limit across a window boundary — an accepted trade for a single INCR
   * on the hot path (see §10).
   */
  private async checkRateLimit(config: RateLimitConfig, req: Request): Promise<void> {
    if (!this.deps.rateLimitEnabled) return;

    const ctx = TenantContext.get();
    const identifier = this.rateLimitIdentifier(config, req);
    const key = RedisKeys.rateLimit(`${ctx?.tenantId ?? 'global'}:${config.group}`, identifier);

    const results = await this.deps.redis.client.multi().incr(key).ttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[1]?.[1] ?? -1);

    if (count === 1 || ttl < 0) {
      await this.deps.redis.client.expire(key, config.windowSeconds);
    }
    if (count > config.limit) {
      throw ApiException.rateLimited(ttl > 0 ? ttl : config.windowSeconds);
    }
  }

  private rateLimitIdentifier(config: RateLimitConfig, req: Request): string {
    const ctx = TenantContext.get();
    switch (config.scope) {
      case 'session':
        return ctx?.sessionId ?? clientIp(req);
      case 'user':
        return ctx?.userId ?? clientIp(req);
      case 'ip+tenant':
      case 'ip':
      default:
        return clientIp(req);
    }
  }

  /* --------------------------------------------------- idempotency */

  private idempotencyKey(req: Request): string | null {
    const raw = req.headers['idempotency-key'];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const tenantId = TenantContext.get()?.tenantId ?? 'global';
    return RedisKeys.idempotency(tenantId, raw);
  }

  private async idempotentReplay(
    key: string,
  ): Promise<{ kind: 'claimed' } | { kind: 'hit'; status: number; body: unknown }> {
    const won = await this.deps.redis.client.set(
      key,
      IDEMPOTENCY_IN_FLIGHT,
      'EX',
      IDEMPOTENCY_TTL,
      'NX',
    );
    if (won === 'OK') return { kind: 'claimed' };

    const existing = (await this.deps.redis.client.get(key)) ?? IDEMPOTENCY_IN_FLIGHT;
    if (existing === IDEMPOTENCY_IN_FLIGHT) {
      throw ApiException.conflict(
        'IDEMPOTENCY_IN_FLIGHT',
        'A request with this Idempotency-Key is still being processed.',
      );
    }
    const parsed = JSON.parse(existing) as { status: number; body: unknown };
    return { kind: 'hit', status: parsed.status, body: parsed.body };
  }

  private async storeIdempotent(key: string, status: number, body: unknown): Promise<void> {
    await this.deps.redis.client.set(
      key,
      JSON.stringify({ status, body }),
      'EX',
      IDEMPOTENCY_TTL,
    );
  }

  /* --------------------------------------------------- RLS transaction */

  private async runInRlsTransaction<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> {
    const runner = this.deps.appDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // set_config with a bind param — SET LOCAL only accepts literals.
      await runner.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      TenantContext.patch({ manager: runner.manager });

      const result = await fn();

      await runner.commitTransaction();
      TenantContext.patch({ manager: undefined });
      // Emit buffered domain events only after COMMIT, so an SSE subscriber
      // reacting by fetching the order over REST is guaranteed to find it.
      this.flushEvents();
      return result;
    } catch (err) {
      await runner.rollbackTransaction().catch(() => undefined);
      TenantContext.patch({ manager: undefined });
      // Events from work that just rolled back must not escape.
      TenantContext.drainEvents();
      throw err;
    } finally {
      await runner.release();
    }
  }

  private flushEvents(): void {
    for (const { name, event } of TenantContext.drainEvents()) {
      this.deps.eventBus.emit(name, event);
    }
  }

  /* -------------------------------------------------------- response */

  private sendStored(res: Response, status: number, body: unknown): void {
    if (body === undefined || status === HttpStatus.NO_CONTENT) {
      res.status(status).end();
      return;
    }
    if (res.statusCode === HttpStatus.NOT_MODIFIED) {
      res.end();
      return;
    }
    res.status(status).json(body);
  }

  /** The Express error-handling middleware (replaces ApiExceptionFilter). */
  errorHandler(): (err: unknown, req: Request, res: Response, next: NextFunction) => void {
    const isProduction = this.deps.isProduction;
    return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
      // A stream that already sent headers (SSE) cannot become a JSON error.
      if (res.headersSent) {
        res.end();
        return;
      }

      const { status, body } = renderError(err, req, isProduction);
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        const retryAfter = body.error.details?.retry_after;
        if (typeof retryAfter === 'number') res.setHeader('Retry-After', String(retryAfter));
      }
      res.status(status).json(body);
    };
  }
}

/* ------------------------------------------------------------------ helpers */

function envelopeBody(result: unknown): unknown {
  if (result instanceof EnvelopedResponse) return { data: result.data, meta: result.meta };
  if (result === undefined) return undefined;
  return { data: result };
}

function renderError(
  err: unknown,
  req: Request,
  isProduction: boolean,
): { status: number; body: ApiErrorResponse } {
  if (err instanceof ApiException) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }

  const requestId = TenantContext.get()?.requestId ?? 'unknown';
  // eslint-disable-next-line no-console
  console.error(
    `[${requestId}] unhandled error on ${req.method} ${req.url}:`,
    err instanceof Error ? err.stack : err,
  );

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
        ...(isProduction
          ? {}
          : { details: { cause: err instanceof Error ? err.message : String(err) } }),
      },
    },
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Behind the documented ingress, express populates req.ip from the leftmost
 * X-Forwarded-For entry when `trust proxy` is set (main.ts does).
 */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
