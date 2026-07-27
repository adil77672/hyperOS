import type { AuthSession, PlatformTenant, TenantStatus } from './platform-types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const STORAGE_KEY = 'hz_super_session';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
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

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const access = token ?? loadSession()?.access_token;
  if (access) headers.set('Authorization', `Bearer ${access}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? `HTTP ${res.status}`, res.status);
  }
  return (json?.data ?? json) as T;
}

export const api = {
  login: (email: string, password: string, tenant_slug = 'platform') =>
    request<AuthSession>(
      '/api/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password, tenant_slug }) },
      null,
    ),

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

  listTenants: () => request<PlatformTenant[]>('/api/v1/platform/tenants'),

  setTenantStatus: (id: string, status: TenantStatus) =>
    request<PlatformTenant>(`/api/v1/platform/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};
