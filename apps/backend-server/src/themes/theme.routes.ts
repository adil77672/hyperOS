import { Router } from 'express';
import { UserRole } from '@hyperzod/shared-types';
import { RateLimits } from '../common/rate-limits';
import { Http } from '../framework/http';
import { parseBody } from '../framework/validation';
import { ThemesService } from './themes.service';
import { UpdateThemeDto } from './dto/theme.dto';

/** API_AND_EVENT_CONTRACTS §9. Mounted at /api/v1/dashboard/theme. */
export function themeRoutes(http: Http, themes: ThemesService): Router {
  const router = Router();

  router.get(
    '/',
    http.route(
      {
        roles: [UserRole.TENANT_ADMIN, UserRole.MERCHANT_OWNER, UserRole.MERCHANT_STAFF],
        rateLimit: RateLimits.dashboardRead,
      },
      () => themes.get(),
    ),
  );

  // Branding is an owner-level decision; staff can read it but not change it.
  router.put(
    '/',
    http.route(
      {
        roles: [UserRole.TENANT_ADMIN, UserRole.MERCHANT_OWNER],
        rateLimit: RateLimits.dashboardWrite,
      },
      async (req) => themes.replace(await parseBody(UpdateThemeDto, req.body)),
    ),
  );

  return router;
}
