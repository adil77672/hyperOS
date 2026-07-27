'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Menu as MenuType, Product } from '@/lib/types';
import { formatMoney } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { useCart } from '@/lib/cart';
import { ModifierPicker } from './ModifierPicker';
import { Button, EmptyState, Spinner } from './ui';

export function Menu() {
  const { boot } = useStore();
  const { addItem } = useCart();
  const [menu, setMenu] = useState<MenuType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const currency = boot?.tenant.default_currency_code ?? 'AUD';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .menu()
      .then((m) => {
        if (!alive) return;
        setMenu(m);
        setActive(m.categories[0]?.id ?? null);
      })
      .catch((e) => {
        // Previously a failed fetch fell through to "No items yet", which is
        // indistinguishable from an empty menu. Surface it and let the customer
        // retry instead.
        if (alive) setError(e?.message ?? 'Could not load the menu.');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const categories = useMemo(
    () => (menu?.categories ?? []).filter((c) => c.products.length > 0),
    [menu],
  );

  if (loading) return <Spinner label="Loading menu…" />;
  if (error)
    return (
      <div className="rounded-theme border border-brand-danger/30 bg-brand-danger/5 p-6 text-center">
        <p className="font-semibold text-brand-danger">Couldn’t load the menu</p>
        <p className="mt-1 text-sm text-brand-fg/60">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  if (categories.length === 0) return <EmptyState title="No items yet" hint="Check back soon." />;

  async function handleAdd(modifierIds: string[], quantity: number, notes: string) {
    if (!picking) return;
    await addItem(picking, quantity, modifierIds, notes);
    setToast(`${picking.name} added to cart`);
    setPicking(null);
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
      {/* Category rail */}
      <nav className="hidden lg:block">
        <ul className="sticky top-24 space-y-1">
          {categories.map((c) => (
            <li key={c.id}>
              <a
                href={`#cat-${c.id}`}
                onClick={() => setActive(c.id)}
                className={`block rounded-theme px-3 py-2 text-sm transition ${
                  active === c.id ? 'bg-brand-muted font-semibold' : 'hover:bg-brand-muted'
                }`}
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-10">
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-24">
            <h2 className="mb-4 font-heading text-2xl font-bold">{c.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPicking(p)}
                  disabled={p.status === 'OUT_OF_STOCK'}
                  className="group flex items-start justify-between gap-4 rounded-theme border border-brand-border p-4 text-left transition hover:border-brand-primary hover:shadow-sm disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{p.name}</span>
                    {p.description && (
                      <span className="mt-1 line-clamp-2 block text-sm text-brand-fg/60">
                        {p.description}
                      </span>
                    )}
                    <span className="mt-2 block text-sm font-semibold text-brand-primary">
                      {formatMoney(p.price_amount_cents, p.currency_code || currency)}
                    </span>
                    {p.status === 'OUT_OF_STOCK' && (
                      <span className="mt-1 block text-xs text-brand-danger">Sold out</span>
                    )}
                  </span>
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      className="h-20 w-20 flex-none rounded-theme object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {picking && (
        <ModifierPicker
          product={picking}
          currency={currency}
          onClose={() => setPicking(null)}
          onAdd={handleAdd}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-fg px-5 py-2.5 text-sm font-medium text-brand-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
