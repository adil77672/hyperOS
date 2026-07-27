'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, openOrderStream } from '@/services/admin-api';
import { formatMoney } from '@/lib/money';
import {
  ACTIVE_ORDER_STATUSES,
  NEXT_STATUS,
  STATUS_LABEL,
  type Order,
  type OrderStatus,
} from '@/services/admin-types';
import { useAuth } from '@/services/admin-auth';

export default function OrdersPage() {
  const { merchant } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!merchant) return;
    const list = await api.orders(merchant.id, ACTIVE_ORDER_STATUSES.join(','));
    setOrders(list);
  }, [merchant]);

  useEffect(() => {
    if (!merchant) return;
    let stop: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        await reload();
        setError(null);
        stop = await openOrderStream(merchant.id, {
          onEvent: (event) => {
            if (event === 'order.created' || event === 'order.status_changed' || event === 'catchup_gap') {
              void reload();
            }
          },
          onError: () => setLive(false),
        });
        if (!cancelled) setLive(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load orders');
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [merchant, reload]);

  const columns = useMemo(() => {
    const groups: Record<string, Order[]> = {
      PENDING: [],
      MERCHANT_ACCEPTED: [],
      PREPARING: [],
      READY_FOR_PICKUP: [],
    };
    for (const o of orders) {
      if (o.status in groups) groups[o.status]!.push(o);
      else if (o.status === 'OUT_FOR_DELIVERY') groups.READY_FOR_PICKUP!.push(o);
    }
    return groups;
  }, [orders]);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setBusyId(order.id);
    try {
      const updated = await api.transition(order.id, next);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)).filter((o) =>
        ACTIVE_ORDER_STATUSES.includes(o.status),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(order: Order) {
    const reason = window.prompt('Cancellation reason?')?.trim();
    if (!reason) return;
    setBusyId(order.id);
    try {
      await api.transition(order.id, 'CANCELLED', reason);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!merchant) {
    return <p className="text-ink-700/70">No merchant on this account yet.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Live orders</h1>
          <p className="text-sm text-ink-700/70">Accept, prepare, and mark ready in real time.</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            live ? 'bg-leaf-600/10 text-leaf-700' : 'bg-ink-100 text-ink-700/60'
          }`}
        >
          {live ? 'Live feed' : 'Connecting…'}
        </span>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(columns) as OrderStatus[]).map((status) => (
          <section key={status} className="rounded-2xl border border-ink-200 bg-white/70 p-3">
            <h2 className="mb-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-ink-700/70">
              {STATUS_LABEL[status]}
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs">{columns[status]?.length ?? 0}</span>
            </h2>
            <div className="space-y-3">
              {(columns[status] ?? []).map((order) => (
                <article key={order.id} className="rounded-xl border border-ink-100 bg-ink-50/80 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-sm text-ink-700/70">{order.customer.full_name}</p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatMoney(order.total_cents, order.currency_code)}
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-ink-700/80">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}× {item.product_name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs uppercase tracking-wide text-ink-700/50">
                    {order.fulfillment_type}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {NEXT_STATUS[order.status] && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => void advance(order)}
                        className="rounded-lg bg-leaf-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-leaf-700 disabled:opacity-50"
                      >
                        → {STATUS_LABEL[NEXT_STATUS[order.status]!]}
                      </button>
                    )}
                    {order.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => void cancel(order)}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {(columns[status] ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-ink-700/40">Empty</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
