import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken } from './api';
import type { Bootstrap, Cart, CartItemInput, Product } from './types';

/**
 * App-wide state: the storefront bootstrap (tenant/merchant/theme) and the
 * server-backed cart. The server is the pricing authority — every cart mutation
 * PUTs the full item list and the priced response becomes the displayed cart.
 */
interface StoreValue {
  boot: Bootstrap | null;
  loading: boolean;
  error: string | null;
  cart: Cart | null;
  items: CartItemInput[];
  count: number;
  addItem: (product: Product, quantity: number, modifierIds: string[], notes: string) => Promise<void>;
  updateQuantity: (index: number, quantity: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  clearCart: () => void;
  currency: string;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CartItemInput[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .bootstrap()
      .then((b) => {
        if (!alive) return;
        setBoot(b);
        setCsrfToken(b.session.csrf_token);
        return api.getCart();
      })
      .then((c) => alive && c && setCart(c))
      .catch((e) => alive && setError(e?.message ?? 'Failed to load storefront'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const sync = useCallback(async (next: CartItemInput[]) => {
    const priced = await api.replaceCart(next);
    setItems(next);
    setCart(priced);
  }, []);

  const addItem = useCallback(
    async (product: Product, quantity: number, modifierIds: string[], notes: string) => {
      await sync([
        ...items,
        { product_id: product.id, quantity, selected_modifier_ids: modifierIds, notes: notes || null },
      ]);
    },
    [items, sync],
  );

  const updateQuantity = useCallback(
    async (index: number, quantity: number) => {
      if (quantity < 1) return;
      await sync(items.map((it, i) => (i === index ? { ...it, quantity } : it)));
    },
    [items, sync],
  );

  const removeItem = useCallback(
    async (index: number) => sync(items.filter((_, i) => i !== index)),
    [items, sync],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setCart(null);
  }, []);

  const count = useMemo(() => (cart?.items ?? []).reduce((n, l) => n + l.quantity, 0), [cart]);
  const currency = cart?.currency_code ?? boot?.tenant.default_currency_code ?? 'AUD';

  const value: StoreValue = {
    boot,
    loading,
    error,
    cart,
    items,
    count,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    currency,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
