import { Router } from 'express';
import { HttpStatus } from '../common/api-exception';
import { RateLimits } from '../common/rate-limits';
import { Http } from '../framework/http';
import { parseBody } from '../framework/validation';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SignupDto } from './dto/auth.dto';

/**
 * API_AND_EVENT_CONTRACTS §2.3–2.6.
 *
 * Every route here is skipRlsTx: they run before a tenant context exists, on
 * the platform pool. Nothing in this router may read tenant-scoped data any
 * other way. All are rate-limited per IP (§10).
 */
export function authRoutes(http: Http, auth: AuthService): Router {
  const router = Router();
  const base = { skipRlsTx: true, rateLimit: RateLimits.auth } as const;

  router.post(
    '/login',
    http.route({ ...base }, async (req) => auth.login(await parseBody(LoginDto, req.body))),
  );

  router.post(
    '/signup',
    http.route({ ...base, status: HttpStatus.CREATED }, async (req) =>
      auth.signup(await parseBody(SignupDto, req.body)),
    ),
  );

  router.post(
    '/refresh',
    http.route({ ...base }, async (req) => {
      const dto = await parseBody(RefreshDto, req.body);
      return auth.refresh(dto.refresh_token);
    }),
  );

  router.post(
    '/logout',
    http.route({ ...base, status: HttpStatus.NO_CONTENT }, async (req) => {
      const dto = await parseBody(RefreshDto, req.body);
      await auth.logout(dto.refresh_token);
      return undefined;
    }),
  );

  return router;
}
