import { Router } from 'express';
import { UserRole } from '@hyperzod/shared-types';
import { RateLimits } from '../common/rate-limits';
import { Http } from '../framework/http';
import { parseBody, uuidParam } from '../framework/validation';
import { PlatformService } from './platform.service';
import { UpdateTenantStatusDto } from './dto/platform.dto';

/**
 * Super-admin control plane. Mounted at /api/v1/platform.
 * All routes require SUPER_ADMIN and skip RLS (platform pool).
 */
export function platformRoutes(http: Http, platform: PlatformService): Router {
  const router = Router();
  const opts = {
    roles: [UserRole.SUPER_ADMIN],
    skipRlsTx: true,
    rateLimit: RateLimits.dashboardRead,
  } as const;
  const write = {
    roles: [UserRole.SUPER_ADMIN],
    skipRlsTx: true,
    rateLimit: RateLimits.dashboardWrite,
  } as const;

  router.get(
    '/tenants',
    http.route(opts, () => platform.listTenants()),
  );

  router.get(
    '/tenants/:tenantId',
    http.route(opts, (req) => platform.getTenant(uuidParam(req, 'tenantId'))),
  );

  router.patch(
    '/tenants/:tenantId',
    http.route(write, async (req) => {
      const dto = await parseBody(UpdateTenantStatusDto, req.body);
      return platform.setTenantStatus(uuidParam(req, 'tenantId'), dto.status);
    }),
  );

  return router;
}
