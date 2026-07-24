import 'reflect-metadata';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { validateEnv } from './config/env.validation';
import { Logger } from './common/logger';
import { buildContainer } from './container';
import { mountRoutes } from './routes';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = validateEnv(process.env as Record<string, unknown>);
  const c = await buildContainer(config);

  const app = express();

  // Behind the documented ingress, the client IP is the leftmost
  // X-Forwarded-For entry. Without this the per-IP rate limits all collapse
  // onto the proxy's single address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Storefront and dashboard are served from separate origins (tenant
  // subdomains and admin.*), so the browser needs CORS with credentials to
  // send the hzsid cookie.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // curl / same-origin / server-to-server
        try {
          const host = new URL(origin).hostname;
          const allowed =
            host === config.PLATFORM_ROOT_DOMAIN ||
            host.endsWith(`.${config.PLATFORM_ROOT_DOMAIN}`) ||
            host === config.DASHBOARD_HOST ||
            host === 'localhost' ||
            host === '127.0.0.1';
          callback(null, allowed);
        } catch {
          callback(null, false);
        }
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'ETag'],
    }),
  );

  // Health, tenant resolution, every /api/v1 router, and the error handler —
  // all wired in routes/index.ts, in the one order that matters.
  mountRoutes(app, c);

  const server = app.listen(config.PORT, () => {
    logger.log(`Hyperzod backend listening on http://localhost:${config.PORT}`);
    logger.log(`  storefront:  http://{tenant}.${config.PLATFORM_ROOT_DOMAIN}/api/v1/storefront/*`);
    logger.log(`  dashboard:   http://${config.DASHBOARD_HOST}/api/v1/dashboard/*`);
    logger.log(`  health:      http://localhost:${config.PORT}/health`);
  });

  const shutdown = (signal: string): void => {
    logger.log(`${signal} received, shutting down.`);
    server.close(() => {
      void c.shutdown().then(() => process.exit(0));
    });
    // Don't hang forever if a connection won't drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // A boot failure (bad env, DB unreachable) must exit non-zero so the
  // orchestrator restarts or halts the rollout rather than serving a half-up
  // process.
  // eslint-disable-next-line no-console
  console.error('Fatal: backend failed to start.', err);
  process.exit(1);
});
