import { Router } from 'express';
import { OrderStatus } from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import { MERCHANT_DASHBOARD_ROLES } from '../common/roles';
import { RateLimits } from '../common/rate-limits';
import { clampLimit } from '../common/pagination';
import { Http } from '../framework/http';
import { withMeta } from '../framework/envelope';
import { parseBody, queryString, uuidParam } from '../framework/validation';
import { MerchantsService } from '../merchants/merchants.service';
import { OrdersService } from './orders.service';
import { TransitionOrderDto } from './dto/transition.dto';

/**
 * Dashboard order management (API_AND_EVENT_CONTRACTS §6). Mounted at
 * /api/v1/dashboard. The live feed is SSE (see sse.routes); these are the REST
 * reads plus the single FSM write.
 */
export function orderRoutes(
  http: Http,
  orders: OrdersService,
  merchants: MerchantsService,
): Router {
  const router = Router();

  router.get(
    '/merchants/:merchantId/orders',
    http.route(
      { roles: MERCHANT_DASHBOARD_ROLES, rateLimit: RateLimits.dashboardRead },
      async (req) => {
        const merchantId = uuidParam(req, 'merchantId');
        await merchants.assertAccess(merchantId);

        const { orders: page, nextCursor } = await orders.list({
          merchantId,
          statuses: parseStatuses(queryString(req, 'status')),
          search: queryString(req, 'search')?.trim() || undefined,
          limit: clampLimit(queryString(req, 'limit')),
          cursor: queryString(req, 'cursor'),
        });

        return withMeta(page, { next_cursor: nextCursor, has_more: nextCursor !== null });
      },
    ),
  );

  router.get(
    '/orders/:orderId',
    http.route(
      { roles: MERCHANT_DASHBOARD_ROLES, rateLimit: RateLimits.dashboardRead },
      async (req) => {
        const order = await orders.findById(uuidParam(req, 'orderId'));
        if (!order) throw ApiException.notFound('Order');
        return order;
      },
    ),
  );

  router.post(
    '/orders/:orderId/transition',
    http.route(
      { roles: MERCHANT_DASHBOARD_ROLES, rateLimit: RateLimits.dashboardWrite, idempotent: true },
      async (req) => {
        const orderId = uuidParam(req, 'orderId');
        const dto = await parseBody(TransitionOrderDto, req.body);
        return orders.transition(orderId, dto.target_status, dto.reason ?? null);
      },
    ),
  );

  return router;
}

/** Accepts a single status or a comma-separated list, ignoring unknowns. */
function parseStatuses(raw: string | undefined): OrderStatus[] | undefined {
  if (!raw) return undefined;
  const valid = new Set(Object.values(OrderStatus));
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is OrderStatus => valid.has(s as OrderStatus));
  return parsed.length ? parsed : undefined;
}
