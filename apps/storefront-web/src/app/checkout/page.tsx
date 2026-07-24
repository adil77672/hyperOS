'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/store/store-context';
import { useCart } from '@/store/cart';
import { formatMoney } from '@/lib/money';
import { Button, Field, Spinner, inputClass } from '@/components/ui';

type Fulfillment = 'PICKUP' | 'DELIVERY';

export default function CheckoutPage() {
  const router = useRouter();
  const { boot } = useStore();
  const { cart, items, clear, loading } = useCart();
  const currency = cart?.currency_code ?? boot?.tenant.default_currency_code ?? 'AUD';

  const [fulfillment, setFulfillment] = useState<Fulfillment>('PICKUP');
  const [form, setForm] = useState({ full_name: '', contact_email: '', contact_phone: '', address: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (loading && !cart) return <Spinner label="Loading…" />;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center">
        <p className="text-brand-fg/60">Your cart is empty.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/')}>
          Back to menu
        </Button>
      </div>
    );
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email)) e.contact_email = 'Enter a valid email';
    if (!/^\+[1-9]\d{6,14}$/.test(form.contact_phone))
      e.contact_phone = 'Use international format, e.g. +61400111222';
    if (fulfillment === 'DELIVERY' && !form.address.trim()) e.address = 'Delivery address required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { order } = await api.checkout({
        fulfillment_type: fulfillment,
        customer: {
          full_name: form.full_name.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim(),
        },
        delivery_address: fulfillment === 'DELIVERY' ? form.address.trim() : null,
        notes: form.notes.trim() || null,
        items,
      });
      clear();
      router.push(`/order/${order.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold">Checkout</h1>

        <div>
          <span className="mb-2 block text-sm font-medium">Fulfillment</span>
          <div className="grid grid-cols-2 gap-3">
            {(['PICKUP', 'DELIVERY'] as Fulfillment[]).map((f) => (
              <button
                key={f}
                onClick={() => setFulfillment(f)}
                className={`rounded-theme border px-4 py-3 text-sm font-medium transition ${
                  fulfillment === f ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border'
                }`}
              >
                {f === 'PICKUP' ? '🏪 Pickup' : '🛵 Delivery'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.full_name}>
            <input
              className={inputClass}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="Phone" error={errors.contact_phone}>
            <input
              className={inputClass}
              placeholder="+61400111222"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email" error={errors.contact_email}>
              <input
                className={inputClass}
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </Field>
          </div>
          {fulfillment === 'DELIVERY' && (
            <div className="sm:col-span-2">
              <Field label="Delivery address" error={errors.address}>
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Order notes (optional)">
              <input
                className={inputClass}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {serverError && (
          <div className="rounded-theme border border-brand-danger/30 bg-brand-danger/5 p-3 text-sm text-brand-danger">
            {serverError}
          </div>
        )}
      </div>

      <aside className="h-fit rounded-theme border border-brand-border p-5 lg:sticky lg:top-24">
        <h2 className="font-heading text-lg font-semibold">Order</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {cart.items.map((l) => (
            <li key={l.line_id} className="flex justify-between gap-3">
              <span className="text-brand-fg/70">
                {l.quantity}× {l.product_name}
              </span>
              <span>{formatMoney(l.line_total_cents, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-brand-border pt-3 text-base font-bold">
          <span>Total</span>
          <span>{formatMoney(cart.total_cents, currency)}</span>
        </div>
        <Button className="mt-5 w-full" disabled={submitting} onClick={submit}>
          {submitting ? 'Placing order…' : `Place order · ${formatMoney(cart.total_cents, currency)}`}
        </Button>
        <p className="mt-3 text-center text-xs text-brand-fg/50">
          Payment is arranged with the store. You’ll get an order number to track status.
        </p>
      </aside>
    </div>
  );
}
