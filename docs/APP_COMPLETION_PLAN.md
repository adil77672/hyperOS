# App Completion Plan — backend, web, mobile

> **Purpose.** An honest, trackable checklist of what is **built** vs. what is
> **remaining** to call each app "complete." Pairs with
> `FUSIONWAVE_HYPEROS_MASTER_PLAN.md` (the strategy) — this is the execution
> checklist.
>
> Legend: ✅ done & verified · 🟡 partial · ⬜ not started

---

## 0. How to run everything

All three apps talk to the same backend API.

```bash
# one-time
npm run install:all            # root workspaces + mobile app deps
cp apps/backend-server/.env.example apps/backend-server/.env
cp apps/storefront-web/.env.example apps/storefront-web/.env.local
cp apps/mobile-app/.env.example apps/mobile-app/.env

# database (Postgres + Redis must be running — see main README)
npm run db:schema
npm run db:seed

# run the two servers together (backend :3000/:3100 + web :3200)
npm run dev:all

# mobile needs its own terminal (Expo takes over the TTY + a simulator/device)
npm run dev:mobile             # then press i (iOS) / a (Android), or scan in Expo Go
```

Individual apps:

| Command | Runs | URL |
| --- | --- | --- |
| `npm run dev:backend` | Express API | http://localhost:3000 |
| `npm run dev:web` | Next.js storefront | http://localhost:3200 |
| `npm run dev:mobile` | Expo React Native | Expo Go / simulator |

> Ports: the backend reads `PORT` from `apps/backend-server/.env` (3000 by
> default; we've also used 3100). Point the web `.env.local`
> (`NEXT_PUBLIC_API_BASE`) and mobile `.env` (`EXPO_PUBLIC_API_BASE`) at
> whichever the backend is on.

---

## 1. Backend (`apps/backend-server`) — Node.js + Express + TS

### Built ✅
- Multi-tenant RLS isolation (forced), two DB pools.
- Auth: signup, login, refresh (rotation), logout; scrypt hashing.
- Storefront: bootstrap, menu (ETag), product, cart, checkout, order status.
- Catalog CRUD: categories, products, modifier groups, modifiers.
- Themes: get/replace with hex/font/CDN validation.
- Orders: list (keyset), get, FSM transition (trigger-authoritative).
- Live SSE merchant order feed + reconnect replay.
- Cross-cutting: envelopes, rate limits, idempotency, CSRF, health/readiness.
- 14 unit tests (pricing/modifiers) passing.

### Remaining to "complete"
- ⬜ **Payments** — gateway integration (region-dependent): create intent,
  webhook confirm, refund. Blocks real money flow.
- ⬜ **Notifications** — email/SMS on order events (provider TBD).
- ⬜ **Outbound webhooks** — HMAC-signed delivery + retries (contract spec'd).
- ⬜ **Customer accounts** — registration, login, saved addresses, reorder.
- ⬜ **Coupons/discounts** — validation + application in checkout totals.
- ⬜ **Delivery** — zones (PostGIS), fees, driver assignment, tracking gateway.
- ⬜ **Operating hours enforcement** — reject orders outside open windows.
- ⬜ **Multi-branch** — many merchants per tenant, branch-scoped staff.
- ⬜ **Super-admin control plane** — tenant/subscription/commission management.
- 🟡 **Tests** — add integration tests (auth, checkout, RLS) + e2e.

---

## 2. Web (`apps/storefront-web`) — Next.js 15 + Tailwind

### Built ✅ (customer storefront)
- Theme-aware shell (tenant colors/fonts/radius injected as CSS vars).
- Home + hero, category-railed menu.
- Product modifier picker (SINGLE/MULTIPLE, required/min/max, live price).
- Cart page (server-priced, quantity, remove).
- Checkout (pickup/delivery, validation, guest details).
- Order tracking (status stepper, polling).
- Typed API client (credentials + CSRF), verified against live backend + CORS.

### Remaining to "complete"
- ⬜ **Merchant dashboard** (new area or app): login, live order board (SSE),
  accept/prepare/ready, catalog editor, theme editor, hours, settings.
- ⬜ **Branch ops board**: KDS-style incoming orders, printer, geofence.
- ⬜ **Super-admin console**: tenants, subscriptions, analytics.
- ⬜ **Customer accounts UI**: login, order history, saved addresses, reorder.
- ⬜ **SEO/SSR polish**: per-tenant metadata, sitemaps, OG images, RSC data.
- ⬜ **Multi-merchant discovery**: location entry, nearby stores, UnifiedCart.
- ⬜ **Payments UI**: card/wallet at checkout once backend lands.
- ⬜ **Accessibility + i18n pass**, empty/error states everywhere, tests.

---

## 3. Mobile (`apps/mobile-app`) — Expo React Native + TS

### Built ✅ (customer app)
- Expo SDK 52, React Native 0.76, React Navigation (native-stack).
- Menu screen (hero, categories, products, floating cart bar).
- Modifier bottom sheet (same rules as web).
- Cart, Checkout, Order status screens.
- Typed API client (native cookie jar handles session; CSRF header).
- Theme palette from bootstrap. Typechecks clean.

### Remaining to "complete"
- ⬜ **Run/verify on simulator + device** (needs Xcode/Android or Expo Go).
- ⬜ **Customer accounts**: login, profile, order history, saved addresses.
- ⬜ **Push notifications** (Expo Notifications) for order status.
- ⬜ **Live tracking map** (delivery phase).
- ⬜ **Payments** (Stripe/── RN SDK) once backend lands.
- ⬜ **Driver app** — separate RN app or role: accept, navigate, proof of
  delivery, payouts.
- ⬜ **Offline/error handling, deep links, app-store build config (EAS)**.

---

## 4. Documentation (md files) — status

| Doc | Purpose | Status |
| --- | --- | --- |
| `README.md` | Setup + run all apps | ✅ updated |
| `docs/FUSIONWAVE_HYPEROS_MASTER_PLAN.md` | Strategy, SRS/SDD/UML, cost, GTM | ✅ v0.1 |
| `docs/APP_COMPLETION_PLAN.md` | This execution checklist | ✅ |
| `API_AND_EVENT_CONTRACTS.md` | Wire contracts | ✅ (source) |
| `SYSTEM_DATA_DICTIONARY.md` | Schema reference | ✅ (source) |
| `HYPERZOD_PRODUCT_MAPPING.md` | Capability/phase map | ✅ (source) |
| `HYPERZOD_MASTER_CONTEXT.md` | Architecture context | ✅ (source) |
| `docs/DECISIONS.md` | Architecture Decision Records | ⬜ to write |
| Per-app `README.md` (web, mobile) | App-local run notes | ⬜ to write |
| OpenAPI/Swagger spec | Generated API reference | ⬜ to write |

---

## 5. Suggested completion order

1. **Merchant dashboard (web)** — makes the platform operable end-to-end for a
   real merchant (accept orders via the SSE feed already built).
2. **Payments + notifications (backend)** — unblocks real revenue + comms.
3. **Customer accounts (backend + web + mobile)** — retention, reorder.
4. **Coupons, operating hours, multi-branch (backend + dashboards)**.
5. **Delivery + driver app** — the logistics moat.
6. **Super-admin console + subscription billing** — the SaaS business layer.
7. **AI catalog import, UnifiedCart, KDS** — the differentiators.

Each step ships to a pilot before the next begins (see master plan §16).
