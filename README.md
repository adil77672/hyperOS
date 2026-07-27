# Hyperzod Platform

Multi-tenant white-label web ordering SaaS for coffee shops and restaurants.
Node.js + Express + TypeScript backend, PostgreSQL (RLS-enforced tenancy) + Redis.

> **Architecture note.** The backend is plain Node.js + Express in TypeScript —
> no application framework. NestJS's building blocks were hand-ported: DI → the
> composition root in `src/container.ts`, guards + interceptors → the HTTP
> kernel in `src/framework/http.ts`, `@nestjs/jwt`/`event-emitter`/`config` →
> small local equivalents under `src/framework` and `src/auth`. This departs
> from `HYPERZOD_MASTER_CONTEXT.md §2.3` (which specifies NestJS) by explicit
> request.

> **Naming.** The `HYPERZOD_` prefix is retained per the spec docs, which
> themselves flag it for rename before the repo grows (competitor's name → IP /
> brand-confusion risk). Not blocking; flagged.

---

## What's here (Phase 1)

| App / package | Status | What it is |
| --- | --- | --- |
| `apps/backend-server` | **Built & verified** | Express API — auth, storefront, checkout, catalog CRUD, order FSM, live SSE feed, platform admin |
| `apps/storefront-web` | **Built & verified** | Next.js 15 customer storefront — menu, modifiers, cart, checkout, order tracking |
| `apps/merchant-dashboard` | **Built** | Next.js merchant ops — login, live order board (SSE), catalog, settings/theme |
| `apps/super-admin-console` | **Built** | Next.js platform control plane — tenant list, suspend/activate/cancel |
| `apps/mobile-app` | **Built (typechecks)** | Expo React Native customer app — same customer flow, native screens |
| `packages/shared-types` | **Built** | DTOs, enums, error codes, money helpers shared across apps |

**Apps and ports:**

```
apps/backend-server        → http://localhost:3000
apps/storefront-web        → http://localhost:3200
apps/merchant-dashboard    → http://localhost:3300
apps/super-admin-console   → http://localhost:3400
apps/mobile-app            → Expo Go / simulator
```

Coverage today: **customer journey** (web + mobile), **merchant dashboard**, and **super-admin tenant control**.
Driver app, payments, and delivery logistics remain deferred (see completion plan).

---

## Prerequisites

- **Node.js 20+** (repo tested on Node 24). `node -v`
- **PostgreSQL 15+ with PostGIS 3.3** and **Redis 7+**.

The schema uses `pgcrypto`, `citext`, and `postgis`, so a plain Postgres won't
do — you need the PostGIS build. Two ways to get both services:

### Option A — Docker (simplest, if you have Docker)

```bash
npm run infra:up      # starts postgres (postgis/postgis:15-3.3) + redis
# ... work ...
npm run infra:down
```

### Option B — Homebrew (no Docker)

```bash
brew install postgis redis         # postgis pulls a matching PostgreSQL
brew services start postgresql@17   # use the version postgis installed; `brew services list` shows it
brew services start redis
createdb hyperzod                   # runs as your macOS login = the DB superuser
```

> Homebrew's Postgres superuser is your **macOS username**, not `postgres`. Set
> `DATABASE_SUPERUSER=<your-username>` (blank `DATABASE_SUPERUSER_PASSWORD` —
> local auth is `trust`) in `apps/backend-server/.env` so `db:schema` can create
> the extensions and the `app_runtime` / `platform_admin` roles.

---

## Run the backend

```bash
# 1. Install workspace dependencies (from repo root)
npm install

# 2. Build the shared types package the backend imports
npm run build --workspace @hyperzod/shared-types

# 3. Configure the backend
cd apps/backend-server
cp .env.example .env
#   - set JWT_SECRET to 32+ chars:  openssl rand -hex 32
#   - if using Homebrew Postgres, set DATABASE_SUPERUSER to your macOS username
#     (Homebrew's default superuser is your login name, not "postgres")

# 4. Create the schema (extensions, tables, RLS, roles, triggers).
#    Runs as the DB superuser — it creates the app_runtime / platform_admin roles.
npm run db:schema

# 5. Seed a demo tenant ("The Cheesy One" — the worked example from the specs)
npm run db:seed

# 6. Run it (from apps/backend-server)
npm run start:dev        # watch mode
#   or: npm run build && npm start
```

**Directory matters for the run command:**
- from `apps/backend-server`: `npm run start:dev`
- from the **repo root**: `npm run dev` (there is no `start:dev` at the root)

The server logs its URLs on boot and listens on `PORT` (default `3000`).

---

## Run all three apps (one command)

Root `package.json` orchestrates every app. See `docs/APP_COMPLETION_PLAN.md`
for the full matrix.

```bash
# one-time: install everything (workspaces + the standalone mobile app)
npm run install:all

# create the app env files
cp apps/storefront-web/.env.example apps/storefront-web/.env.local
cp apps/mobile-app/.env.example apps/mobile-app/.env

# run the two long-lived servers together (backend + Next.js web)
npm run dev:all
```

| Command (from repo root) | Runs | URL |
| --- | --- | --- |
| `npm run dev:all` | backend + storefront + merchant + super-admin | :3000, :3200, :3300, :3400 |
| `npm run dev:backend` | Express API | http://localhost:3000 |
| `npm run dev:web` | Next.js storefront | http://localhost:3200 |
| `npm run dev:dashboard` | Merchant dashboard | http://localhost:3300 |
| `npm run dev:admin` | Super-admin console | http://localhost:3400 |
| `npm run dev:mobile` | Expo React Native | Expo Go / simulator |

> **Mobile runs separately** — Expo takes over the terminal and needs a
> simulator or the Expo Go app, so it isn't bundled into `dev:all`. Run
> `npm run dev:mobile`, then press `i` (iOS) / `a` (Android) or scan the QR.
> Point `EXPO_PUBLIC_API_BASE` at a host the device can reach (localhost for the
> iOS simulator, `10.0.2.2` for the Android emulator, your LAN IP for a phone).

**Verified this build:** `dev:all` brings up both servers (backend
`{postgres:ok, redis:ok}`, web serving the storefront); the Next.js app builds
and the Expo app typechecks clean.

### Smoke test

```bash
# health (no tenant needed)
curl http://localhost:3000/health

# storefront — DEV_FALLBACK_TENANT_SLUG=cheesyone lets localhost resolve a tenant
curl http://localhost:3000/api/v1/storefront/bootstrap
curl http://localhost:3000/api/v1/storefront/menu

# dashboard login (credentials printed by the seed script)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Host: admin.example.com' \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@cheesyone.com","password":"cheesyone-dev-12345"}'
```

`admin.example.com` in the `Host` header is what flips the request into
dashboard mode locally (`DASHBOARD_HOST` in `.env`). Storefront requests use
the tenant subdomain (`cheesyone.example.com`) in production; locally the dev
fallback slug stands in.

---

## How tenancy works (the load-bearing part)

Every request:

1. **Resolve tenant** — `Host` header (storefront) or JWT claim (dashboard) →
   `tenantId`, held in `AsyncLocalStorage` (`tenant-resolution.middleware.ts`).
2. **Open an RLS transaction** — the HTTP kernel (`framework/http.ts`) runs
   `BEGIN; SELECT set_config('app.current_tenant', <uuid>, true);` so every
   query is row-filtered by Postgres RLS. `SET LOCAL` scope means a pooled
   connection can't leak one tenant's context into the next request.
3. **Handler runs** — services use the transaction-bound `EntityManager`.
4. **Commit, then flush events** — domain events (SSE `order.created` etc.) are
   buffered and emitted only *after* commit, so a dashboard reacting to an SSE
   frame can actually read the order.

The kernel's `route(options, handler)` wrapper is where the old NestJS guard +
interceptor stack now lives, in explicit order: rate limit → auth → roles →
CSRF → idempotency → RLS transaction → handler → event flush → envelope.

Two DB pools: `app_runtime` (NOBYPASSRLS, every request) and `platform_admin`
(BYPASSRLS, only host→tenant resolution and signup, which run before a tenant
context exists). See `HYPERZOD_MASTER_CONTEXT.md §3`.

---

## Tests

```bash
cd apps/backend-server
npm test          # pricing/modifier engine — 14 tests, no DB required
```

The pricing suite reproduces the Cappuccino worked example from
`HYPERZOD_PRODUCT_MAPPING.md §3.3` and `API_AND_EVENT_CONTRACTS.md §4.1`
verbatim — it's the guard that server-side pricing matches the spec.

---

## Implemented endpoints (Phase 1)

**Auth** (`/api/v1/auth`) — signup, login, refresh, logout
**Storefront** (`/api/v1/storefront`) — bootstrap, menu (ETag), product, cart, checkout, order status
**Dashboard** (`/api/v1/dashboard`) — merchant get/settings, catalog CRUD (categories, products, modifier groups, modifiers), order list/get/transition, theme get/replace, **SSE order stream**

Cross-cutting: `{ data, meta }` / `{ error }` envelopes, cursor pagination,
Redis token-bucket rate limits, `Idempotency-Key` replay, double-submit CSRF
for storefront sessions. All per `API_AND_EVENT_CONTRACTS.md`.

---

## Deferred (not stubbed — deliberately absent)

Per `HYPERZOD_MASTER_CONTEXT.md §9` and the phase roadmap:

- **Payments** — blocked on the launch-region / provider `[TBD]`. v1 places
  orders in `PENDING`; the merchant accepts/declines from the dashboard.
- **Tax & delivery fees** — region-dependent `[TBD]`; both computed as `0` in
  v1 with a single documented seam in `catalog/pricing.ts → computeTotals`.
- **Email / SMS / webhooks** — provider `[TBD]`. Not silently stubbed; a
  no-op notifier that drops messages would be worse than an obvious absence.
- **Custom domains, coupons, customer accounts, scheduled orders** — Phase 2.
- **Delivery network, dispatch, mobile apps, reviews, loyalty** — Phase 3.

---

## Layout

```
apps/backend-server/src/
  main.ts         Express bootstrap: middleware + route mounting
  container.ts    composition root (hand-wired DI; all singletons)
  config/         env validation (fail-fast on boot)
  framework/      HTTP kernel (route wrapper = guards + interceptors),
                  validation, envelope, event bus
  database/       schema.sql (authoritative DDL), entities, apply-schema, seed
  tenancy/        AsyncLocalStorage context, host-resolution middleware, RLS tx
  auth/           JWT (jsonwebtoken) + Redis sessions, scrypt password hashing
  common/         ApiException, logger, rate-limit + role tables, pagination
  merchants/  themes/  catalog/  orders/  checkout/  notifications/  health/
                  each: *.service.ts + *.routes.ts (Express Router factory)
packages/shared-types/   enums, DTOs, error codes, money helpers
infra/docker/            docker-compose (postgres+postgis, redis)
```
# Hyperzod
