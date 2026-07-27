'use client';

import Link from 'next/link';
import { StoreProvider } from '@/lib/store-context';
import { Header } from '@/components/Header';

/**
 * (user) — authenticated customer area, mounted at /account.
 *
 * Registered customer accounts are a Phase 2 capability (PRODUCT_MAPPING §2),
 * so today this is a guest-oriented placeholder: it reuses the storefront
 * chrome and points at order tracking. When accounts ship, this group gains a
 * real auth provider + order history / saved addresses / reorder.
 */
export default function AccountPage() {
  return (
    <StoreProvider>
      <Header />
      <main className="mx-auto w-full max-w-container px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-bold">Your account</h1>
        <p className="mt-2 text-brand-fg/60">
          Guest checkout is available now — accounts, saved addresses, and order history are coming
          soon.
        </p>
        <div className="mt-6 rounded-theme border border-brand-border p-5">
          <p className="text-sm text-brand-fg/70">
            Placed an order? Track it from the confirmation link, or{' '}
            <Link href="/products" className="font-medium text-brand-primary underline">
              browse the menu
            </Link>
            .
          </p>
        </div>
      </main>
    </StoreProvider>
  );
}
