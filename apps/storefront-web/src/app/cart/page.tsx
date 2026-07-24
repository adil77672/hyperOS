'use client';

import Link from 'next/link';
import { useStore } from '@/store/store-context';
import { useCart } from '@/store/cart';
import { formatMoney } from '@/lib/money';
import { Button, EmptyState, Spinner } from '@/components/ui';

export default function CartPage() {
  const { boot } = useStore();
  const { cart, loading, updateQuantity, removeItem } = useCart();
  const currency = cart?.currency_code ?? boot?.tenant.default_currency_code ?? 'AUD';

  if (loading && !cart) return <Spinner label="Loading cart…" />;
  if (!cart || cart.items.length === 0)
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold">Your cart</h1>
        <EmptyState title="Your cart is empty" hint="Add something tasty from the menu." />
        <Link href="/" className="text-sm font-medium text-brand-primary underline">
          ← Back to menu
        </Link>
      </div>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="mb-4 font-heading text-2xl font-bold">Your cart</h1>
        <ul className="divide-y divide-brand-border rounded-theme border border-brand-border">
          {cart.items.map((line, index) => (
            <li key={line.line_id} className="flex gap-4 p-4">
              <div className="flex-1">
                <p className="font-medium">{line.product_name}</p>
                {line.selected_modifiers.length > 0 && (
                  <p className="mt-0.5 text-sm text-brand-fg/60">
                    {line.selected_modifiers.map((m) => m.name).join(', ')}
                  </p>
                )}
                {line.notes && <p className="mt-0.5 text-xs italic text-brand-fg/50">“{line.notes}”</p>}
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-theme border border-brand-border text-sm">
                    <button className="px-2.5 py-1" onClick={() => updateQuantity(index, line.quantity - 1)}>
                      −
                    </button>
                    <span className="w-7 text-center font-semibold">{line.quantity}</span>
                    <button className="px-2.5 py-1" onClick={() => updateQuantity(index, line.quantity + 1)}>
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    className="text-xs font-medium text-brand-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="text-right font-semibold">
                {formatMoney(line.line_total_cents, currency)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit rounded-theme border border-brand-border p-5 lg:sticky lg:top-24">
        <h2 className="font-heading text-lg font-semibold">Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Subtotal" value={formatMoney(cart.subtotal_cents, currency)} />
          {cart.delivery_fee_cents > 0 && (
            <Row label="Delivery" value={formatMoney(cart.delivery_fee_cents, currency)} />
          )}
          {cart.tax_cents > 0 && <Row label="Tax" value={formatMoney(cart.tax_cents, currency)} />}
          {cart.discount_cents > 0 && (
            <Row label="Discount" value={`−${formatMoney(cart.discount_cents, currency)}`} />
          )}
          <div className="border-t border-brand-border pt-2">
            <Row label="Total" value={formatMoney(cart.total_cents, currency)} bold />
          </div>
        </dl>
        <Link href="/checkout" className="mt-5 block">
          <Button className="w-full" disabled={!boot?.merchant?.accepting_orders}>
            {boot?.merchant?.accepting_orders ? 'Checkout' : 'Store closed'}
          </Button>
        </Link>
        <Link href="/" className="mt-3 block text-center text-sm text-brand-fg/60 hover:underline">
          Add more items
        </Link>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-bold' : ''}`}>
      <dt className={bold ? '' : 'text-brand-fg/60'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
