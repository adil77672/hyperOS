import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiException } from '../common/api-exception';
import { Logger } from '../common/logger';
import { SESSION_COOKIE, SessionService } from '../auth/session.service';
import { JwtService } from '../auth/jwt.service';
import { RequestContext, TenantContext } from './tenant-context';
import { TenantResolverService, normalizeHost } from './tenant-resolver.service';

export interface TenantResolutionConfig {
  rootDomain: string;
  dashboardHost: string;
  devFallbackSlug?: string;
  cookieSecure: boolean;
}

/**
 * Step 2–4 of MASTER_CONTEXT §5.3, as Express middleware (replaces the Nest
 * NestMiddleware class).
 *
 * Two resolution paths:
 *  - storefront hosts resolve the tenant from `Host`;
 *  - the single dashboard host resolves it from the JWT claim, because one
 *    hostname serves every tenant's dashboard.
 *
 * A storefront host that resolves to nothing gets a bare 404. It must never
 * say "tenant not found" — that turns the endpoint into a slug oracle.
 *
 * The whole downstream chain runs inside `TenantContext.run(...)` so every
 * handler, guard, and query sees the request's AsyncLocalStorage store.
 */
export function tenantResolutionMiddleware(
  resolver: TenantResolverService,
  sessions: SessionService,
  jwt: JwtService,
  config: TenantResolutionConfig,
): RequestHandler {
  const logger = new Logger('TenantResolution');
  const dashboardHost = normalizeHost(config.dashboardHost);
  // The dev-fallback message is useful once, but firing it on every request
  // buries the real logs. Log it the first time only.
  let fallbackLogged = false;

  async function applyDashboardContext(req: Request, context: RequestContext): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;

    const token = header.slice('Bearer '.length).trim();
    try {
      const claims = jwt.verify(token);
      context.tenantId = claims.tenantId;
      context.userId = claims.sub;
      context.role = claims.role;
    } catch {
      // Leave the context anonymous. The route's auth check turns this into a
      // 401 with the documented envelope; throwing here would bypass that shape.
    }
  }

  async function applyStorefrontContext(
    req: Request,
    res: Response,
    hostname: string,
    context: RequestContext,
  ): Promise<void> {
    let tenant = await resolver.resolveByHost(hostname, config.rootDomain);

    if (!tenant && config.devFallbackSlug) {
      // Local development: `localhost:3000` carries no tenant subdomain.
      tenant = await resolver.findBySlug(config.devFallbackSlug);
      if (tenant && !fallbackLogged) {
        fallbackLogged = true;
        logger.debug(
          `host "${hostname}" resolving to dev fallback tenant "${tenant.slug}" (logged once)`,
        );
      }
    }

    if (!tenant) throw ApiException.notFound();

    context.tenantId = tenant.id;
    context.tenantSlug = tenant.slug;

    const cookieValue = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const { session, isNew } = await sessions.resolveForTenant(cookieValue, tenant.id);
    context.sessionId = session.id;
    context.userId = session.userId;

    if (isNew) {
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        maxAge: sessions.cookieMaxAgeMs,
        path: '/',
      });
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const hostname = normalizeHost(req.headers.host ?? '');

      // Dashboard mode is normally selected by Host (admin.example.com). But a
      // request carrying an `Authorization: Bearer` token is unambiguously a
      // dashboard/API call — storefront requests authenticate by cookie, never
      // by bearer token. Honouring that here lets the merchant dashboard run on
      // its own local origin (e.g. localhost:3300) without host spoofing, and
      // is safe: an invalid token simply leaves the context anonymous and every
      // protected route returns 401.
      const hasBearer = (req.headers.authorization ?? '').startsWith('Bearer ');
      const context: RequestContext = {
        mode: hostname === dashboardHost || hasBearer ? 'dashboard' : 'storefront',
        requestId: randomUUID(),
      };
      res.setHeader('X-Request-Id', context.requestId);

      try {
        if (context.mode === 'dashboard') {
          await applyDashboardContext(req, context);
        } else {
          await applyStorefrontContext(req, res, hostname, context);
        }
      } catch (err) {
        // Resolution failed (e.g. unknown storefront host). Hand to the error
        // middleware, but still inside a context so it has a request id.
        TenantContext.run(context, () => next(err));
        return;
      }

      TenantContext.run(context, () => next());
    })();
  };
}
