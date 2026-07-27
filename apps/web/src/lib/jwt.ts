/**
 * Isomorphic JWT payload decode — safe to import from both Edge Middleware
 * (`middleware.ts`, which runs in the Edge runtime, not Node) and ordinary
 * browser/client code. No framework imports, no Node-only APIs: just `atob`,
 * which both environments provide as a global.
 *
 * This is a DECODE, not a VERIFY. It reads the claims without checking the
 * signature. That is a deliberate, documented tradeoff — see middleware.ts for
 * why that's an acceptable edge-routing gate rather than a security boundary.
 */

/**
 * Two distinct cookies, mirroring the two distinct `localStorage` sessions
 * (`hz_merchant_session`, `hz_super_session`). A single shared cookie would
 * mean logging into one section overwrites the other's edge-visible session —
 * e.g. a super-admin login in one tab would make middleware bounce an
 * already-valid merchant-admin tab back to its login. Keeping them separate
 * avoids that cross-section collision entirely.
 */
export const ADMIN_SESSION_COOKIE = 'hz_admin_at';
export const SUPER_ADMIN_SESSION_COOKIE = 'hz_super_at';

export interface DashboardJwtClaims {
  sub?: string;
  tenantId?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export function decodeJwtPayload<T = DashboardJwtClaims>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64url = parts[1]!;
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** True if the token decodes and its `exp` claim is still in the future. */
export function isJwtLive(token: string | undefined | null): boolean {
  if (!token) return false;
  const claims = decodeJwtPayload(token);
  return !!claims?.exp && claims.exp * 1000 > Date.now();
}
