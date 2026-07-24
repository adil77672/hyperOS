import { Router } from 'express';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

/**
 * Load-balancer probes. Registered before tenant resolution so they answer
 * without a Host we control and before any tenant exists.
 *
 * Plain Express handlers — no route wrapper, because these must not require a
 * tenant context, an RLS transaction, or the envelope.
 */
export function healthRoutes(appDataSource: DataSource, redis: RedisService): Router {
  const router = Router();

  // Liveness: the process is up.
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: dependencies answer. This is what gates traffic.
  router.get('/ready', async (_req, res) => {
    const checks: Record<string, string> = {};

    checks.postgres = await appDataSource
      .query('SELECT 1')
      .then(() => 'ok')
      .catch((err: Error) => `error: ${err.message}`);

    checks.redis = await redis.client
      .ping()
      .then(() => 'ok')
      .catch((err: Error) => `error: ${err.message}`);

    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
  });

  return router;
}
