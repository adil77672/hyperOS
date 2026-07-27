import { decodeJwtPayload } from './jwt';

/**
 * Mirrors a dashboard JWT into a plain (non-httpOnly) cookie so Edge
 * Middleware can read it — `localStorage`, where the session otherwise lives,
 * is invisible to middleware, which runs before any page JS executes.
 *
 * Why not httpOnly: this cookie is written by client-side JS reading the
 * login response body (the backend's `/auth/login` returns JSON, not a
 * `Set-Cookie` header — that's a deliberate backend design, see
 * auth.service.ts). An httpOnly cookie can only be set via a response header,
 * so a JS-writable cookie is the only way to mirror the token without
 * changing the backend's auth response shape.
 *
 * Security model: this cookie is a ROUTING signal only. Middleware decodes it
 * without verifying the signature (Edge-safe, dependency-free) to redirect
 * fast and avoid shipping protected page HTML/JS to an obviously-unauthed
 * visitor. The real security boundary is unchanged — every dashboard API call
 * still carries the same JWT as a Bearer header, and the backend verifies its
 * signature on every request. A forged cookie gets you past the middleware
 * redirect; it does not get you past the backend, which 401s immediately.
 *
 * `cookieName` is caller-supplied (ADMIN_SESSION_COOKIE / SUPER_ADMIN_SESSION_
 * COOKIE from jwt.ts) rather than a single shared name, so the merchant and
 * platform sessions can't clobber each other across tabs.
 */
export function setDashboardSessionCookie(cookieName: string, accessToken: string): void {
  if (typeof document === 'undefined') return;

  const claims = decodeJwtPayload(accessToken);
  const maxAgeSeconds = claims?.exp ? Math.max(0, claims.exp - Math.floor(Date.now() / 1000)) : 0;
  if (maxAgeSeconds <= 0) return; // already-expired token; don't bother writing it

  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${cookieName}=${accessToken}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function clearDashboardSessionCookie(cookieName: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
}
