import type { Bootstrap, Cart, CartItemInput, Menu, Order, Product } from './types';

/**
 * Typed API client for the mobile app.
 *
 * Session handling: React Native's fetch is backed by the platform's native
 * HTTP stack (NSURLSession / OkHttp), which keeps a per-host cookie jar. So the
 * `hzsid` session cookie the backend sets on bootstrap is persisted and resent
 * automatically — no manual cookie handling needed, unlike Node's fetch.
 *
 * CSRF: captured from the bootstrap response body and replayed as an
 * `X-CSRF-Token` header on state-changing calls (cart, checkout).
 */
const BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3100';

let csrfToken: string | null = null;
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { csrf?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.csrf && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(err?.code ?? 'UNKNOWN', err?.message ?? `Request failed (${res.status})`, res.status);
  }
  return (json?.data ?? json) as T;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/v1/storefront/bootstrap'),
  menu: () => request<Menu>('/api/v1/storefront/menu'),
  product: (id: string) => request<Product>(`/api/v1/storefront/products/${id}`),
  getCart: () => request<Cart>('/api/v1/storefront/cart'),
  replaceCart: (items: CartItemInput[]) =>
    request<Cart>('/api/v1/storefront/cart', { method: 'PUT', csrf: true, body: JSON.stringify({ items }) }),
  checkout: (payload: {
    fulfillment_type: 'PICKUP' | 'DELIVERY';
    customer: { full_name: string; contact_email: string; contact_phone: string };
    delivery_address?: string | null;
    notes?: string | null;
    items: CartItemInput[];
  }) =>
    request<{ order: Order }>('/api/v1/storefront/checkout', {
      method: 'POST',
      csrf: true,
      body: JSON.stringify(payload),
    }),
  order: (id: string) => request<{ order: Order }>(`/api/v1/storefront/orders/${id}`),
};

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
