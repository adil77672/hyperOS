'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { formatMoney } from '@/lib/money';
import { Spinner } from '@/components/ui';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Placed' },
  { status: 'MERCHANT_ACCEPTED', label: 'Accepted' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY_FOR_PICKUP', label: 'Ready' },
  { status: 'DELIVERED', label: 'Completed' },
];

const TERMINAL: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'];

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get('token') ?? undefined;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const { order: o } = await api.order(id, token);
        if (!alive) return;
        setOrder(o);
        // Keep polling until the order reaches a terminal state.
        if (!TERMINAL.includes(o.status)) timer = setTimeout(poll, 5000);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Order not found');
      }
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, token]);

  if (error)
    return (
      <div className="rounded-theme border border-brand-danger/30 bg-brand-danger/5 p-6 text-center">
        <p className="font-semibold text-brand-danger">Order not found</p>
        <p className="mt-1 text-sm text-brand-fg/60">{error}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-brand-primary underline">
          Back to menu
        </Link>
      </div>
    );
  if (!order) return <Spinner label="Loading order…" />;

  const cancelled = order.status === 'CANCELLED' || order.status === 'DELIVERY_FAILED';
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <p className="text-sm text-brand-fg/60">Order</p>
        <h1 className="font-heading text-3xl font-bold">{order.order_number}</h1>
        <p className="mt-1 text-sm text-brand-fg/60">
          {order.fulfillment_type === 'PICKUP' ? 'Pickup' : 'Delivery'} ·{' '}
          {new Date(order.placed_at).toLocaleString()}
        </p>
      </div>

      {cancelled ? (
        <div className="rounded-theme border border-brand-danger/30 bg-brand-danger/5 p-5 text-center">
          <p className="font-semibold text-brand-danger">
            {order.status === 'CANCELLED' ? 'Order cancelled' : 'Delivery failed'}
          </p>
          {order.cancellation_reason && (
            <p className="mt-1 text-sm text-brand-fg/60">{order.cancellation_reason}</p>
          )}
        </div>
      ) : (
        <ol className="flex items-center">
          {STEPS.map((step, i) => {
            const done = i <= currentIndex;
            return (
              <li key={step.status} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span
                    className={`h-1 flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-brand-primary' : 'bg-brand-border'}`}
                  />
                  <span
                    className={`grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-bold ${
                      done ? 'text-white' : 'border border-brand-border text-brand-fg/40'
                    }`}
                    style={done ? { background: 'var(--color-primary)' } : undefined}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span
                    className={`h-1 flex-1 ${
                      i === STEPS.length - 1 ? 'opacity-0' : i < currentIndex ? 'bg-brand-primary' : 'bg-brand-border'
                    }`}
                  />
                </div>
                <span className={`mt-2 text-xs ${done ? 'font-semibold' : 'text-brand-fg/50'}`}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rounded-theme border border-brand-border">
        <div className="border-b border-brand-border p-4">
          <h2 className="font-heading font-semibold">Items</h2>
        </div>
        <ul className="divide-y divide-brand-border">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-4 p-4">
              <div>
                <p className="font-medium">
                  {it.quantity}× {it.product_name}
                </p>
                {it.modifiers.length > 0 && (
                  <p className="mt-0.5 text-sm text-brand-fg/60">
                    {it.modifiers.map((m) => m.modifier_name).join(', ')}
                  </p>
                )}
              </div>
              <span className="font-semibold">{formatMoney(it.line_total_cents, order.currency_code)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-brand-border p-4 text-base font-bold">
          <span>Total</span>
          <span>{formatMoney(order.total_cents, order.currency_code)}</span>
        </div>
      </div>

      <div className="text-center">
        <Link href="/" className="text-sm font-medium text-brand-primary underline">
          Order again
        </Link>
      </div>
    </div>
  );
}
