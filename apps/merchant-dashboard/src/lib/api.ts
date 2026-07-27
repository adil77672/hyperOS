import type {
  AuthSession,
  DashboardMe,
  Menu,
  Merchant,
  Order,
  ThemeDocument,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const STORAGE_KEY = 'hz_merchant_session';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function loadSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return;
  if (!session) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const access = token ?? loadSession()?.access_token;
  if (access) headers.set('Authorization', `Bearer ${access}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
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
  return (json?.data ?? json) as T;
}

export const api = {
  login: (email: string, password: string, tenant_slug?: string) =>
    request<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenant_slug }),
    }, null),

  logout: async () => {
    const session = loadSession();
    if (session?.refresh_token) {
      try {
        await request('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        }, null);
      } catch {
        /* ignore */
      }
    }
    saveSession(null);
  },

  me: () => request<DashboardMe>('/api/v1/dashboard/me'),

  patchMerchant: (id: string, body: Partial<Merchant>) =>
    request<Merchant>(`/api/v1/dashboard/merchants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  menu: (merchantId: string) =>
    request<Menu>(`/api/v1/dashboard/merchants/${merchantId}/menu`),

  orders: (merchantId: string, status?: string) =>
    request<Order[]>(
      `/api/v1/dashboard/merchants/${merchantId}/orders?limit=50${
        status ? `&status=${encodeURIComponent(status)}` : ''
      }`,
    ),

  transition: (orderId: string, target_status: string, reason?: string | null) =>
    request<Order>(`/api/v1/dashboard/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ target_status, reason: reason ?? null }),
    }),

  getTheme: () => request<ThemeDocument>('/api/v1/dashboard/theme'),

  putTheme: (theme: ThemeDocument) =>
    request<ThemeDocument>('/api/v1/dashboard/theme', {
      method: 'PUT',
      body: JSON.stringify(theme),
    }),

  createCategory: (merchantId: string, name: string) =>
    request(`/api/v1/dashboard/merchants/${merchantId}/categories`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ name, is_active: true }),
    }),

  createProduct: (
    merchantId: string,
    body: {
      category_id: string;
      name: string;
      description?: string;
      price_amount_cents: number;
      status?: string;
    },
  ) =>
    request(`/api/v1/dashboard/merchants/${merchantId}/products`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ status: 'ACTIVE', ...body }),
    }),

  patchProduct: (productId: string, body: Record<string, unknown>) =>
    request(`/api/v1/dashboard/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

/** Open a Bearer-authenticated SSE stream (native EventSource cannot set Authorization). */
export async function openOrderStream(
  merchantId: string,
  handlers: {
    onEvent: (event: string, data: unknown, id?: string) => void;
    onError?: (err: unknown) => void;
  },
  lastEventId?: string,
): Promise<() => void> {
  const access = loadSession()?.access_token;
  if (!access) throw new Error('Not signed in');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${access}`,
    Accept: 'text/event-stream',
  };
  if (lastEventId) headers['Last-Event-ID'] = lastEventId;

  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/v1/dashboard/merchants/${merchantId}/orders/stream`, {
    headers,
    signal: ctrl.signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(new Error(`SSE failed (${res.status})`));
    return () => ctrl.abort();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const chunk of parts) {
          let event = 'message';
          let data = '';
          let id: string | undefined;
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
            else if (line.startsWith('id:')) id = line.slice(3).trim();
          }
          if (!data) continue;
          try {
            handlers.onEvent(event, JSON.parse(data), id);
          } catch {
            handlers.onEvent(event, data, id);
          }
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) handlers.onError?.(err);
    }
  })();

  return () => ctrl.abort();
}
