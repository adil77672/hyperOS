export type RateLimitScope = 'ip' | 'ip+tenant' | 'session' | 'user';

export interface RateLimitConfig {
  /** Route-group label; becomes part of the Redis key. */
  group: string;
  limit: number;
  windowSeconds: number;
  scope: RateLimitScope;
}

/** The table in API_AND_EVENT_CONTRACTS §10, as code. */
export const RateLimits = {
  storefrontRead: { group: 'storefront-read', limit: 300, windowSeconds: 60, scope: 'ip+tenant' },
  storefrontCart: { group: 'storefront-cart', limit: 60, windowSeconds: 60, scope: 'session' },
  storefrontCheckout: { group: 'storefront-checkout', limit: 5, windowSeconds: 60, scope: 'session' },
  auth: { group: 'auth', limit: 10, windowSeconds: 60, scope: 'ip' },
  dashboardRead: { group: 'dashboard-read', limit: 300, windowSeconds: 60, scope: 'user' },
  dashboardWrite: { group: 'dashboard-write', limit: 60, windowSeconds: 60, scope: 'user' },
} satisfies Record<string, RateLimitConfig>;
