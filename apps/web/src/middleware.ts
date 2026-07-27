import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, SUPER_ADMIN_SESSION_COOKIE, decodeJwtPayload } from '@/lib/jwt';

/**
 * Single multi-tenant web app — routing model.
 *
 * The STORE is identified by the incoming domain: the backend resolves the
 * tenant from the `Host` header (`abc.com` or `cheesyone.hyperos.co` → that
 * tenant), so the storefront pages live at the ROOT (`/`, `/products`, `/cart`)
 * inside the `(storefront)` route group — there is no `[domain]` path segment.
 *
 * The other surfaces are plain path-based route groups in the same app:
 *   /account       → (user)          authenticated customer area (no gate yet
 *                                      — see (user)/account/page.tsx)
 *   /admin/*       → (admin)         store/merchant dashboard — EDGE-GATED
 *   /super-admin/* → (super-admin)   platform console — EDGE-GATED
 *
 * Edge gate. Both dashboard sections mirror their JWT into a plain cookie on
 * login (see lib/dashboard-session-cookie.ts) specifically so this middleware
 * can read it — `localStorage`, where the session otherwise lives, does not
 * exist in the Edge runtime. The gate DECODES the JWT (checks `role` + `exp`)
 * without verifying its signature: that's an Edge-safe, zero-dependency check
 * good enough to redirect an obviously-unauthed visitor before any protected
 * page ships. It is not the security boundary — every dashboard API call
 * still carries the same JWT as a Bearer header, and the backend verifies the
 * signature on every request (framework/http.ts `checkAuth`/`checkRoles`). A
 * forged cookie clears this gate but is rejected by every real request.
 */
const MERCHANT_DASHBOARD_ROLES = new Set(['TENANT_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF']);
const SUPER_ADMIN_ROLES = new Set(['SUPER_ADMIN']);

function readRole(req: NextRequest, cookieName: string, allowed: Set<string>): boolean {
  const token = req.cookies.get(cookieName)?.value;
  if (!token) return false;
  const claims = decodeJwtPayload(token);
  if (!claims?.role || !claims.exp) return false;
  if (claims.exp * 1000 <= Date.now()) return false;
  return allowed.has(claims.role);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminSection = pathname.startsWith('/admin');
  const isSuperAdminSection = pathname.startsWith('/super-admin');
  if (!isAdminSection && !isSuperAdminSection) return NextResponse.next();

  const cookieName = isSuperAdminSection ? SUPER_ADMIN_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
  const allowedRoles = isSuperAdminSection ? SUPER_ADMIN_ROLES : MERCHANT_DASHBOARD_ROLES;
  const loginPath = isSuperAdminSection ? '/super-admin/login' : '/admin/login';
  const homePath = isSuperAdminSection ? '/super-admin' : '/admin';

  const authorized = readRole(req, cookieName, allowedRoles);
  const isLoginPage = pathname === loginPath;

  // Already signed in with the right role: skip the login screen.
  if (isLoginPage) {
    return authorized ? NextResponse.redirect(new URL(homePath, req.url)) : NextResponse.next();
  }

  // Everything else in the section requires the role. `next` lets the login
  // page return the visitor to where they were headed once they sign in.
  if (!authorized) {
    const url = new URL(loginPath, req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
