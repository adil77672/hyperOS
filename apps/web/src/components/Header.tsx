'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store-context';
import { useCart } from '@/lib/cart';

export function Header() {
  const { boot } = useStore();
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border bg-brand-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-container items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          {boot?.theme.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boot.theme.logo_url} alt="" className="h-9 w-9 rounded-theme object-cover" />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-theme text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {(boot?.tenant.name ?? 'HZ').slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="font-heading text-lg font-semibold">{boot?.tenant.name ?? 'Storefront'}</span>
        </Link>

        <div className="flex items-center gap-2">
          {boot?.merchant && !boot.merchant.accepting_orders && (
            <span className="rounded-full bg-brand-danger/10 px-3 py-1 text-xs font-medium text-brand-danger">
              Not accepting orders
            </span>
          )}
          <Link
            href="/cart"
            className="relative rounded-theme border border-brand-border px-4 py-2 text-sm font-medium transition hover:bg-brand-muted"
          >
            Cart
            {count > 0 && (
              <span
                className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-bold text-white"
                style={{ background: 'var(--color-accent)' }}
              >
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
