'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Cart, CartItemInput, Product } from '@/lib/types';

/**
 * Cart state, backed by the server.
 *
 * The client keeps the list of {product, qty, modifier ids}, but the SERVER is
 * the pricing authority: every mutation PUTs the full item list and the
 * response — with re-derived unit prices and totals — becomes the displayed
 * cart. The storefront never computes a price it then trusts.
 */
interface CartContextValue {
  cart: Cart | null;
  items: CartItemInput[];
  loading: boolean;
  count: number;
  addItem: (product: Product, quantity: number, modifierIds: string[], notes?: string) => Promise<void>;
  updateQuantity: (index: number, quantity: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  clear: () => void;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItemInput[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const sync = useCallback(async (next: CartItemInput[]) => {
    setLoading(true);
    try {
      const priced = await api.replaceCart(next);
      setItems(next);
      setCart(priced);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCart(await api.getCart());
    } finally {
      setLoading(false);
    }
  }, []);

  // Load whatever the session already had (cart survives in Redis for 7 days).
  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const addItem = useCallback(
    async (product: Product, quantity: number, modifierIds: string[], notes?: string) => {
      const next = [
        ...items,
        { product_id: product.id, quantity, selected_modifier_ids: modifierIds, notes: notes ?? null },
      ];
      await sync(next);
    },
    [items, sync],
  );

  const updateQuantity = useCallback(
    async (index: number, quantity: number) => {
      if (quantity < 1) return;
      const next = items.map((it, i) => (i === index ? { ...it, quantity } : it));
      await sync(next);
    },
    [items, sync],
  );

  const removeItem = useCallback(
    async (index: number) => {
      await sync(items.filter((_, i) => i !== index));
    },
    [items, sync],
  );

  const clear = useCallback(() => {
    setItems([]);
    setCart(null);
  }, []);

  const count = useMemo(() => (cart?.items ?? []).reduce((n, l) => n + l.quantity, 0), [cart]);

  const value: CartContextValue = {
    cart,
    items,
    loading,
    count,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    refresh,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
