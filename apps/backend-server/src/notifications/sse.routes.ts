import { Router } from 'express';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { SSE_EVENT_CATCHUP_GAP, SseEnvelope } from '@hyperzod/shared-types';
import { MERCHANT_DASHBOARD_ROLES } from '../common/roles';
import { Http } from '../framework/http';
import { uuidParam } from '../framework/validation';
import { MerchantsService } from '../merchants/merchants.service';
import { TenantContext } from '../tenancy/tenant-context';
import { withTenantTransaction } from '../tenancy/with-tenant-transaction';
import { MerchantSseService } from './merchant-sse.service';

/**
 * Live merchant order feed (API_AND_EVENT_CONTRACTS §5). Mounted at
 * /api/v1/dashboard.
 *
 * `raw: true` — the handler owns the response socket (writes SSE frames);
 * `skipRlsTx: true` — the stream is long-lived, so it must not pin a pooled
 * transaction for its lifetime. Authorisation runs in a short, separate
 * transaction before the first byte is written (§5.6).
 */
export function sseRoutes(
  http: Http,
  sse: MerchantSseService,
  merchants: MerchantsService,
  appDataSource: DataSource,
  heartbeatMs: number,
): Router {
  const router = Router();

  router.get(
    '/merchants/:merchantId/orders/stream',
    http.route(
      { roles: MERCHANT_DASHBOARD_ROLES, skipRlsTx: true, raw: true },
      async (req: Request, res: Response) => {
        const merchantId = uuidParam(req, 'merchantId');
        const tenantId = TenantContext.requireTenantId();

        await withTenantTransaction(appDataSource, tenantId, () =>
          merchants.assertAccess(merchantId),
        );

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();

        const write = (frame: SseEnvelope): void => {
          res.write(
            `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`,
          );
        };

        const lastEventId = headerValue(req, 'last-event-id');
        const { frames, gap } = await sse.replay(tenantId, merchantId, lastEventId);

        if (gap) {
          res.write(
            `event: ${SSE_EVENT_CATCHUP_GAP}\ndata: ${JSON.stringify({
              reason: 'BUFFER_EXPIRED',
              message: 'Refetch active orders over REST.',
            })}\n\n`,
          );
        }
        for (const frame of frames) write(frame);

        const unsubscribe = await sse.subscribe(tenantId, merchantId, write);
        const heartbeat = setInterval(() => {
          res.write(`:heartbeat ${new Date().toISOString()}\n\n`);
        }, heartbeatMs);

        const cleanup = (): void => {
          clearInterval(heartbeat);
          void unsubscribe();
        };
        req.on('close', cleanup);
        res.on('error', cleanup);
      },
    ),
  );

  return router;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0];
  return raw ?? undefined;
}
