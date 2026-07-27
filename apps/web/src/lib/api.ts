import type { Bootstrap, Cart, CartItemInput, Menu, Order, Product } from './types';

/**
 * Typed browser client for the storefront API.
 *
 * Two things every call needs and this centralises:
 *  - `credentials: 'include'` — the backend sets the `hzsid` session cookie on
 *    bootstrap and reads it on every subsequent request. Same-hostname / cross
 *    -port (localhost:3200 → :3000) is same-site, so the Lax cookie flows.
 *  - the CSRF token — state-changing storefront routes require the double
 *    -submit `X-CSRF-Token` header (MASTER_CONTEXT §4). We capture it from
 *    bootstrap and replay it on cart/checkout writes.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

let csrfToken: string | null = null;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { csrf?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.csrf && csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
      res.status,
      err?.details,
    );
  }
  // The backend envelopes success as { data, meta }.
  return (json?.data ?? json) as T;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/v1/storefront/bootstrap'),

  menu: () => request<Menu>('/api/v1/storefront/menu'),

  product: (id: string) => request<Product>(`/api/v1/storefront/products/${id}`),

  getCart: () => request<Cart>('/api/v1/storefront/cart'),

  replaceCart: (items: CartItemInput[]) =>
    request<Cart>('/api/v1/storefront/cart', {
      method: 'PUT',
      csrf: true,
      body: JSON.stringify({ items }),
    }),

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

  order: (id: string, token?: string) =>
    request<{ order: Order }>(
      `/api/v1/storefront/orders/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`,
    ),
};

export { ApiError };
