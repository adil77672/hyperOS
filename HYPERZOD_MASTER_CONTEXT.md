# HYPERZOD_MASTER_CONTEXT.md

> **Status.** Supersedes any prior version of this file in the workspace.
> Regenerated with expanded scope: web-first SaaS, custom-domain routing,
> integer-cents pricing, coffee-shop / restaurant vertical focus.
>
> **Naming note.** File retains the `HYPERZOD_` prefix per instruction.
> Recommend renaming to your actual product name before this repo grows —
> continuing to use a competitor's name in your own codebase creates IP and
> brand-confusion risk. Not urgent, but flagged.

---

## 1. Product Positioning

| Attribute | Value |
| --- | --- |
| Product type | Localized multi-tenant SaaS |
| Primary customer | Independent restaurants and coffee shops |
| Vertical focus (v1) | Food & beverage only |
| Region | `[ASSUMPTION: single region, single primary currency — user has not confirmed which region]` |
| Entry offer | White-label web ordering storefront |
| Upsell path | Native mobile apps (customer + driver), delivery tracking, dispatch |
| Business model | `[ASSUMPTION: SaaS subscription per merchant. Commission-on-order model deferred — needs decision.]` |

---

## 2. System Architecture

### 2.1 Pattern

Modular monolith to start, event-driven microservices as scale requires.
`[ASSUMPTION: NestJS modular monolith for v1 — a single deployable — is
the right call at merchant count < ~500. Splitting into microservices
before service-level scale pressure exists would slow shipping without
buying anything. Module boundaries below are drawn so extraction later is
mechanical.]`

### 2.2 Communication Layers

| Layer | Transport | Purpose |
| --- | --- | --- |
| Public REST | HTTP/JSON | Customer storefront browse/checkout, merchant dashboard CRUD, auth |
| Merchant real-time | **SSE** (Server-Sent Events) | Server-to-merchant order alerts. See §7 for rationale over WebSocket. |
| Customer real-time | Socket.io WebSocket | Driver location streaming for the tracking upsell (already built in `tracking.gateway.ts`) |
| Async internal | `[ASSUMPTION: Redis Streams for v1 durability without adding RabbitMQ]` | Cross-module domain events |
| Outbound webhooks | HTTPS POST with HMAC signing | Merchant-configured endpoints receive order events |

### 2.3 Core Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend | NestJS + TypeScript (Node 20 LTS) | Strict TS |
| Database | PostgreSQL 15+ | Primary data store; RLS enforces tenancy |
| Geo | PostGIS 3.3+ | Delivery zones (deferred), merchant point location |
| Cache / session | Redis 7+ | Session store, rate limits, SSE fan-out, driver geo |
| Web storefront | `[ASSUMPTION: Next.js 14+ App Router]` | SSR needed for SEO on custom domains |
| Merchant dashboard | `[ASSUMPTION: Next.js SPA-mode or Vite + React]` | Auth'd surface, less SEO-critical |
| Payments | `[TBD: region-dependent — Stripe / Razorpay / PayTabs / PayU / MercadoPago]` | See §9 |
| Notifications | `[TBD: email + SMS + push provider — region-dependent]` | |
| Object storage | `[ASSUMPTION: S3-compatible — AWS S3, R2, or Wasabi]` | Menu images, logos |
| CDN + SSL | `[ASSUMPTION: Cloudflare]` | Wildcard SSL + custom-domain SSL |

---

## 3. Multi-Tenancy Mandate

### 3.1 Isolation Model

- **Level.** Logical isolation via shared database + shared schema, row-scoped by `tenant_id`.
- **`tenant_id` type.** `uuid`, generated with `gen_random_uuid()` (RFC 4122 v4).
- **Rule 1.** Every business row carries a `tenant_id` column. No exceptions.
- **Rule 2.** Every application query includes `WHERE tenant_id = :tenantId` explicitly. No exceptions.
- **Rule 3.** Every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **Rule 4.** RLS policies compare `tenant_id` against `current_tenant_id()` — a `STABLE` function reading the `app.current_tenant` GUC set per transaction.
- **Rule 5.** Foreign keys are composite `(tenant_id, id)` — a child row cannot structurally reference a parent in a different tenant.

### 3.2 Runtime Pattern

Per HTTP request:

```sql
BEGIN;
  SET LOCAL app.current_tenant = '<tenant-uuid-resolved-from-domain-or-jwt>';
  -- all queries here are RLS-constrained
COMMIT;
```

Tenant UUID reaches `SET LOCAL` via `AsyncLocalStorage` populated by the tenant resolution middleware (§5).

### 3.3 Database Roles

| Role | `BYPASSRLS`? | Used by |
| --- | --- | --- |
| `app_runtime` | No | All request handlers |
| `platform_admin` | Yes | Control plane: tenant provisioning, migrations, cross-tenant admin |

### 3.4 Redis and Socket.io Tenancy

Every Redis key and Socket.io room is tenant-prefixed. Examples:

- `geo:drivers:{tenantId}` — driver positions
- `session:{sessionId}` — session record (payload contains `tenantId` for validation)
- `sse:merchant-orders:{tenantId}:{merchantId}` — SSE fan-out channel
- `sse:merchant-buffer:{tenantId}:{merchantId}` — bounded Redis LIST for reconnect replay
- `tenant:{tenantId}:order:{orderId}:tracking` — Socket.io room

---

## 4. Session Storage (Redis)

`[ASSUMPTION: hybrid model — JWT for merchant dashboard auth, Redis-backed
sessions for the customer storefront browser session.]` Storefronts do a lot
of anonymous cart-building before login; Redis sessions handle anonymous
carts naturally. Merchant dashboard uses JWT with short expiry + refresh.

| Concern | Choice |
| --- | --- |
| Session ID | `crypto.randomUUID()`, stored in `hzsid` cookie, `HttpOnly; Secure; SameSite=Lax` |
| Session TTL | 30 days sliding for customers, 12 hours for merchant dashboard |
| Redis key | `session:{sessionId}` → JSON `{ tenantId, userId?, cartId?, csrf, createdAt, lastSeenAt }` |
| Tenant binding | A session records the tenant it was created under; never valid on a different tenant even if the browser sends it |
| CSRF | Double-submit cookie: `csrf` value stored in the session and echoed via header on state-changing requests |

---

## 5. Custom Domain Sub-Routing (Tenant Storefronts)

Two routing modes, both supported.

### 5.1 Mode A — Subdomain per tenant (v1 default)

Format: `{tenant-slug}.{platform-root-domain}`, e.g. `cheesyone.example.com`.

- **DNS.** Wildcard `*.example.com` A/CNAME → storefront ingress.
- **SSL.** Single wildcard cert for `*.example.com`. `[ASSUMPTION: Cloudflare wildcard SSL, free tier.]`
- **Resolution.** Middleware reads `Host` → extracts subdomain → looks up `tenants.slug` → attaches `tenantId`.
- **Ops.** Zero operational cost per tenant.

### 5.2 Mode B — Custom apex/domain per tenant (upsell)

Format: merchant brings `mycoffee.com`.

- **DNS.** Merchant sets CNAME or A record to platform ingress. Verified via TXT-record challenge from the dashboard.
- **SSL.** Automated per-domain via Let's Encrypt. `[ASSUMPTION: Cloudflare "Cloudflare for SaaS" or Caddy on-demand TLS.]`
- **Resolution.** Middleware reads `Host` → exact-match on `tenant_custom_domains` table → attaches `tenantId`.
- **Ops.** Requires: verification flow, SSL issuance monitoring, merchant-visible domain-status UI.

### 5.3 Middleware Order

```
1. TLS termination (ingress)
2. Host header → tenant resolution
3. Session cookie parsing
4. AsyncLocalStorage context set: { tenantId, sessionId?, userId? }
5. Transaction opener sets SET LOCAL app.current_tenant
6. Route handler executes
```

If tenant resolution fails, request returns a generic 404 — never "tenant not found" (that would confirm enumeration).

### 5.4 Merchant Dashboard vs. Storefront

Merchant dashboard is served from a single non-tenant hostname: `[ASSUMPTION: admin.example.com]`. Tenant resolved from JWT claim, not `Host`.

---

## 6. Repository / Directory Map

`[ASSUMPTION: pnpm workspaces + Turborepo.]`

```
repo-root/
├── apps/
│   ├── backend-server/                    # NestJS API + SSE + WebSocket
│   │   └── src/
│   │       ├── main.ts                    # Bootstraps app, attaches Socket.io Redis adapter
│   │       ├── app.module.ts
│   │       │
│   │       ├── config/
│   │       │   └── env.validation.ts
│   │       │
│   │       ├── database/
│   │       │   ├── schema.sql             # DDL (integer-cents pricing)
│   │       │   ├── data-source.ts
│   │       │   ├── migrations/
│   │       │   └── entities/
│   │       │       ├── tenant.entity.ts
│   │       │       ├── tenant-theme.entity.ts
│   │       │       ├── tenant-custom-domain.entity.ts
│   │       │       ├── user.entity.ts
│   │       │       ├── merchant.entity.ts
│   │       │       ├── category.entity.ts
│   │       │       ├── product.entity.ts
│   │       │       ├── product-modifier-group.entity.ts
│   │       │       ├── product-modifier.entity.ts
│   │       │       ├── order.entity.ts
│   │       │       ├── order-item.entity.ts
│   │       │       └── order-item-modifier.entity.ts
│   │       │
│   │       ├── tenancy/
│   │       │   ├── tenancy.module.ts
│   │       │   ├── tenant-context.ts      # AsyncLocalStorage wrapper
│   │       │   ├── tenant-resolution.middleware.ts
│   │       │   └── rls-transaction.interceptor.ts
│   │       │
│   │       ├── auth/
│   │       │   ├── auth.module.ts
│   │       │   ├── auth.service.ts
│   │       │   ├── auth.controller.ts
│   │       │   ├── jwt.strategy.ts
│   │       │   ├── session.service.ts     # Redis session ops
│   │       │   └── roles.guard.ts
│   │       │
│   │       ├── merchants/
│   │       ├── themes/                    # White-label theme CRUD
│   │       ├── catalog/                   # Categories + products + modifiers
│   │       ├── orders/                    # FSM engine (already built)
│   │       ├── checkout/                  # Cart → Order
│   │       ├── payments/                  # [TBD after region decision]
│   │       │
│   │       ├── notifications/
│   │       │   ├── merchant-sse.controller.ts
│   │       │   ├── merchant-sse.service.ts
│   │       │   └── webhooks/
│   │       │       ├── webhook-dispatcher.service.ts
│   │       │       └── webhook-endpoint.entity.ts
│   │       │
│   │       ├── delivery/
│   │       │   └── tracking.gateway.ts    # Already built
│   │       │
│   │       └── redis/
│   │           └── redis.module.ts
│   │
│   ├── storefront-web/                    # Public customer web ordering (Next.js)
│   └── merchant-dashboard/                # Merchant admin (Next.js / Vite + React)
│
├── packages/
│   ├── shared-types/                      # DTOs, enums, event contracts
│   ├── design-tokens/                     # Base tokens overridable by tenant theme
│   └── eslint-config/
│
└── infra/
    ├── docker/
    ├── terraform/                         # [ASSUMPTION: IaC]
    └── migrations-runner/
```

---

## 7. Real-Time Choice: SSE for Merchant Alerts

Prompt listed "SSE or WebSockets." Not equivalent. Decision:

**Merchant dashboard order alerts: SSE.**

- Server → client only. No client → server payloads needed on this channel.
- Native browser reconnect with `Last-Event-ID` header, used to replay missed events.
- Runs over HTTP/1.1 or HTTP/2, passes through corporate proxies more reliably than WebSocket upgrades.
- No custom handshake protocol.

**Customer driver-tracking: Socket.io (already built).** Bi-directional so WebSocket is correct there.

### 7.1 SSE Fan-Out Model

```
[order.controller POST /orders]
        │
        ▼
[orders.service — creates order in DB]
        │
        ▼
[EventEmitter → OrderCreatedEvent]
        │
        ▼
[merchant-sse.service — publishes to Redis channel
   sse:merchant-orders:{tenantId}:{merchantId}
   AND appends to bounded LIST
   sse:merchant-buffer:{tenantId}:{merchantId}]
        │
        ▼
[All backend instances subscribed to that pub/sub channel]
        │
        ▼
[Each instance fans out to locally connected SSE clients
   for that (tenant, merchant)]
```

Redis pub/sub is acceptable because SSE clients reconnect with `Last-Event-ID` and replay from the buffer LIST (bounded, ~200 events). At-least-once semantics on the pub/sub itself are not required.

---

## 8. Order Lifecycle FSM

Enforced in three places (already built in `orders.service.ts`):

1. Postgres `order_status` enum.
2. `enforce_order_status_transition()` trigger — authoritative.
3. `OrdersService.ALLOWED_TRANSITIONS` map — mirror.

Transitions:

```
PENDING            → MERCHANT_ACCEPTED | CANCELLED
MERCHANT_ACCEPTED  → PREPARING         | CANCELLED
PREPARING          → READY_FOR_PICKUP  | CANCELLED
READY_FOR_PICKUP   → OUT_FOR_DELIVERY  | CANCELLED
OUT_FOR_DELIVERY   → DELIVERED         | DELIVERY_FAILED
DELIVERED          → (terminal)
CANCELLED          → (terminal)
DELIVERY_FAILED    → (terminal)
```

For white-label web ordering v1 (no delivery yet), practical flow terminates at either `READY_FOR_PICKUP` (customer pickup) or `DELIVERED` (merchant self-delivers without our driver network). `OUT_FOR_DELIVERY` and the dispatch worker come online with the delivery upsell.

---

## 9. Explicit `[TBD]` Decisions

| Decision | Blocking? | Why |
| --- | --- | --- |
| Launch region / primary currency | Blocks payments | Determines gateway, tax model, currency, sender-ID rules |
| Payment provider | Blocks checkout | Determines webhook signatures, redirect flow, refund API |
| SMS/email/push provider | Blocks notifications | Regional cost + deliverability |
| Coffee-shop-only vs. restaurants-too for v1 | Affects catalog UX | Modifier schema handles both; UX differs |
| Business model — subscription, commission, hybrid | Not blocking v1 build | Affects payment flow later |
| Custom domains in v1 vs. deferred | Affects infra timeline | Adds ~2 weeks of ops work |
| Product name / rename from `HYPERZOD_...` | Not blocking, recommended | IP + brand hygiene |

---

## 10. Cross-File Consistency Contracts

| Concept | Source of truth | Downstream mirrors |
| --- | --- | --- |
| `order_status` values | `schema.sql` enum | `OrderStatus` in `orders.service.ts`; `shared-types`; frontends |
| Allowed FSM transitions | DB trigger | `OrdersService.ALLOWED_TRANSITIONS` |
| Monetary units | **Integer cents (`bigint`) in DB** | All DTOs, all frontend formatters |
| `tenant_id` propagation | `Host` or JWT → middleware → `AsyncLocalStorage` → `SET LOCAL app.current_tenant` | Every service opening a DB transaction |
| Currency per tenant | `tenants.default_currency_code` | All price displays and payment provider calls |
