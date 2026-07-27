import { NextRequest, NextResponse } from 'next/server';

/**
 * Single multi-tenant web app — routing model.
 *
 * The STORE is identified by the incoming domain: the backend resolves the
 * tenant from the `Host` header (`abc.com` or `cheesyone.hyperos.co` → that
 * tenant), so the storefront pages live at the ROOT (`/`, `/products`, `/cart`)
 * inside the `(storefront)` route group — there is no `[domain]` path segment.
 *
 * The other surfaces are plain path-based route groups in the same app:
 *   /account       → (user)          authenticated customer area
 *   /admin/*       → (admin)         store/merchant dashboard
 *   /super-admin/* → (super-admin)   platform console
 *
 * Role-based access control is enforced in each group's layout (client-side,
 * against the JWT). Middleware stays out of the data path — the tenant comes
 * from the domain, handled server-side by the API — so this is deliberately a
 * pass-through today. It is the single, obvious seam to add cookie-based
 * edge auth or apex-domain canonicalisation later.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
