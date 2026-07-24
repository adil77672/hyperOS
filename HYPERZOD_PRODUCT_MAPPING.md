# HYPERZOD_PRODUCT_MAPPING.md

> **Purpose.** Capability catalog for the food & beverage white-label web
> ordering SaaS, mapping planned features to the modules and data model
> they live in. Coffee shops and restaurants only.
>
> **Ground rule.** Nothing in this document is a commitment to build in v1.
> The `Phase` column is the release plan. Everything past Phase 1 is scope
> deliberately deferred.

---

## 1. Merchant Admin Panel — Capability Matrix

### 1.1 Onboarding & Account

| Capability | Phase | Data location | Notes |
| --- | --- | --- | --- |
| Sign up / email verification | 1 | `users` | Merchant creates a tenant + becomes `TENANT_ADMIN` |
| Business profile (name, contact, address, timezone) | 1 | `tenants`, `merchants` | |
| Storefront slug selection (`{slug}.example.com`) | 1 | `tenants.slug` | Unique; format `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$` |
| Custom domain connection | 2 | `tenant_custom_domains` | TXT-record verification + SSL provisioning |
| KYC / business verification | 2 | `[TBD]` | Required for payouts; provider-dependent |

### 1.2 Storefront White-Labeling

| Capability | Phase | Data location |
| --- | --- | --- |
| Logo upload | 1 | `tenant_themes.logo_url` |
| Favicon upload | 1 | `tenant_themes.favicon_url` |
| Brand color palette | 1 | `tenant_themes.colors` (JSONB) |
| Typography (heading + body font) | 1 | `tenant_themes.typography` (JSONB) |
| Storefront hero banner | 1 | `tenant_themes.hero_image_url` |
| "About us" text | 1 | `tenant_themes.about_text` |
| Social links | 1 | `tenant_themes.social_links` (JSONB) |
| Legal pages (merchant-editable terms/privacy) | 2 | `tenant_themes.legal_pages` (JSONB) |
| Full custom CSS override | 3 | Deferred; security risk if not sandboxed |
| Multi-language storefront | 3 | One locale per tenant to start |

### 1.3 Menu Management

| Capability | Phase | Data location |
| --- | --- | --- |
| Create / edit / delete categories | 1 | `categories` |
| Category sort order | 1 | `categories.sort_order` |
| Category visibility toggle | 1 | `categories.is_active` |
| Create / edit / delete products | 1 | `products` |
| Product image (single) | 1 | `products.image_url` |
| Product multi-image gallery | 2 | Deferred table |
| Product price (integer cents) | 1 | `products.price_amount_cents` |
| Product visibility / stock toggle | 1 | `products.status` |
| Modifier groups (see §3) | 1 | `product_modifier_groups`, `product_modifiers` |
| Bulk import (CSV) | 2 | Import service |
| AI menu extraction | 3 | Deferred |

### 1.4 Order Management

| Capability | Phase | Data location |
| --- | --- | --- |
| Live order feed (SSE) | 1 | `orders`, `order_items`, `order_item_modifiers` |
| Accept / reject incoming order | 1 | FSM: `PENDING → MERCHANT_ACCEPTED` or `CANCELLED` |
| Mark preparing / ready | 1 | FSM: `MERCHANT_ACCEPTED → PREPARING → READY_FOR_PICKUP` |
| Mark delivered (self-delivery shortcut) | 1 | FSM shortcut path |
| Cancel with reason | 1 | `orders.cancellation_reason` |
| Order details view (items + modifiers) | 1 | |
| Search / filter historical orders | 1 | Indexed by `(tenant_id, merchant_id, placed_at DESC)` |
| Thermal printer integration | 2 | `[TBD provider — StarPRNT / ESC-POS]` |
| Refund | 2 | Payment-provider-dependent |

### 1.5 Operating Hours & Availability

| Capability | Phase | Data location |
| --- | --- | --- |
| Weekly recurring hours | 1 | `merchant_operating_hours` |
| Holiday closures / one-off overrides | 2 | `merchant_operating_hours_overrides` |
| "Snooze new orders" toggle | 1 | `merchants.accepting_orders` |
| Prep time estimate | 1 | `merchants.avg_prep_minutes` |

### 1.6 Promotions

| Capability | Phase |
| --- | --- |
| Percentage / fixed-amount coupons | 2 |
| BOGO / product-linked deals | 3 |
| Loyalty points | 3 |

### 1.7 Analytics

| Capability | Phase | Notes |
| --- | --- | --- |
| Daily order count + revenue | 1 | Aggregated view over `orders` |
| Top products (30d) | 1 | Aggregated view over `order_items` |
| Revenue breakdown | 1 | Sums from `orders` |
| Customer count (unique, repeat rate) | 2 | Requires customer identity resolution |
| Hourly heat map | 2 | |

### 1.8 Notifications & Webhooks

| Capability | Phase | Notes |
| --- | --- | --- |
| Live in-dashboard order alerts (sound + toast) | 1 | SSE-driven |
| Merchant email on new order | 1 | `[TBD provider]` |
| Merchant SMS on new order | 2 | `[TBD provider]` |
| Configurable outbound webhooks | 2 | See §5 |
| Customer email confirmation | 1 | `[TBD provider]` |
| Customer SMS status | 2 | |

### 1.9 Users & Permissions

| Capability | Phase | Data location |
| --- | --- | --- |
| Invite staff users to tenant | 1 | `users` with role `MERCHANT_OWNER` or staff role |
| Role assignment (owner / staff) | 1 | `users.role` |
| Fine-grained per-module permissions | 3 | Owner/staff binary sufficient for v1 |

---

## 2. Storefront (Customer) — Capability Matrix

| Capability | Phase | Notes |
| --- | --- | --- |
| Menu browsing by category | 1 | |
| Product detail view with modifiers | 1 | |
| Anonymous cart (session-backed) | 1 | Redis session, no login required to build cart |
| Guest checkout | 1 | Email + phone required, no account creation forced |
| Registered customer accounts (per tenant) | 2 | |
| Delivery address entry (no zone check v1) | 1 | Zone check + fee = Phase 2 |
| Pickup vs. delivery selection | 1 | Delivery = merchant-self-delivery in v1 |
| Scheduled orders | 2 | Requires prep-time logic |
| Order tracking page (status only) | 1 | SSE or polling |
| Order tracking page (driver map) | 3 | Requires driver network |
| Reviews / ratings | 3 | |
| Reorder favorite | 2 | |

---

## 3. Menu Modifier / Add-on Logic

Where F&B specialization lives. Coffee shops and restaurants both use this model.

### 3.1 Data Model

Three tables (see `SYSTEM_DATA_DICTIONARY.md` §5):

- **`product_modifier_groups`** — a group of options for a product (e.g. "Milk", "Size").
- **`product_modifiers`** — options within a group (e.g. "Oat milk", "Large"). Each has a delta price (integer cents; can be zero, positive, or negative).
- **`order_item_modifiers`** — snapshot of selected modifiers per line item, preserving name and price at time of order.

### 3.2 Group Selection Rules

Each `product_modifier_groups` row carries:

| Field | Meaning | Example |
| --- | --- | --- |
| `selection_type` | `SINGLE` (radio) or `MULTIPLE` (checkbox) | Milk = `SINGLE`; Extras = `MULTIPLE` |
| `is_required` | Customer must pick at least the minimum | Milk required; Extras optional |
| `min_selections` | Lower bound (`MULTIPLE` only) | Extras: min 0 |
| `max_selections` | Upper bound (`MULTIPLE` only) | Extras: max 3 |

For `SINGLE`, min/max are implicit (0 or 1 depending on `is_required`).

### 3.3 Coffee-Shop Example — "Cappuccino"

**Product.** Cappuccino — base 40000 cents (400.00 in local currency `[ASSUMPTION: 100-minor-unit currency such as USD/EUR/AED]`).

**Modifier groups:**

1. **Size** — `SINGLE`, required
   - Small: `-5000`
   - Regular: `0`
   - Large: `+10000`

2. **Milk** — `SINGLE`, required
   - Whole: `0`
   - Skim: `0`
   - Oat: `+5000`
   - Almond: `+5000`
   - Soy: `+5000`

3. **Extras** — `MULTIPLE`, optional, `min=0`, `max=3`
   - Extra espresso shot: `+7000`
   - Extra foam: `0`
   - Whipped cream: `+3000`
   - Vanilla syrup: `+3000`
   - Caramel syrup: `+3000`
   - Sugar-free syrup: `+3000`

**Server-side pricing rule (authoritative — client-submitted price is never trusted):**

```
line_unit_price = product.price_amount_cents
                + Σ(selected modifiers' delta_price_cents)

line_total      = line_unit_price × quantity
```

### 3.4 Restaurant Example — "Cheeseburger"

**Product.** Cheeseburger — 120000 cents.

**Modifier groups:**

1. **Doneness** — `SINGLE`, required — Rare / Medium / Well-done, all `0`.
2. **Add-ons** — `MULTIPLE`, optional, `min=0`, `max=5` — Bacon `+2500`, Extra cheese `+1500`, Avocado `+3000`.
3. **Remove** — `MULTIPLE`, optional, no max — Lettuce / Tomato / Onion, all `0`.
4. **Side** — `SINGLE`, required — Fries `0`, Salad `+2000`, Onion rings `+2500`.

Same schema handles both verticals. No vertical-specific tables needed for v1.

### 3.5 Server-Side Validation Rules

For every ordered line item:

1. All `is_required = true` groups on the product have at least one selected modifier.
2. `MULTIPLE` groups respect `min_selections` and `max_selections`.
3. `SINGLE` groups have exactly zero (optional) or exactly one (required) selected modifier.
4. Every selected modifier belongs to a group belonging to that product.
5. **The client never sets prices.** The client submits `{ product_id, quantity, selected_modifier_ids[] }`. The server re-derives `line_unit_price` and `line_total`.

---

## 4. Webfront Theme Configuration Schema

### 4.1 Theme Token Contract

Stored on `tenant_themes` row as JSONB:

```json
{
  "colors": {
    "primary":    "#0F5132",
    "secondary":  "#D4A017",
    "accent":     "#B23A48",
    "background": "#FFFFFF",
    "foreground": "#101828",
    "muted":      "#F2F4F7",
    "border":     "#EAECF0",
    "danger":     "#B42318",
    "success":    "#027A48"
  },
  "typography": {
    "heading_font_family": "Playfair Display, serif",
    "body_font_family":    "Inter, system-ui, sans-serif",
    "base_font_size_px":   16,
    "heading_weight":      600,
    "body_weight":         400
  },
  "layout": {
    "border_radius_px": 12,
    "container_max_width_px": 1200
  },
  "hero": {
    "style": "IMAGE_WITH_OVERLAY",
    "overlay_opacity": 0.35,
    "heading_text": "Freshly roasted, daily.",
    "subheading_text": "Order for pickup or delivery."
  },
  "social_links": {
    "instagram": "https://instagram.com/mycoffee",
    "facebook":  null,
    "tiktok":    null
  }
}
```

### 4.2 Validation

- Colors: 6-digit hex (`^#[0-9A-Fa-f]{6}$`).
- Font families: whitelisted against a curated font list; arbitrary strings rejected (prevents CSS injection via variable interpolation).
- Image URLs: must be on the platform CDN. External URLs rejected (prevents referrer leakage and dead-link risk).

### 4.3 Storefront Application

Storefront reads `tenant_themes` on SSR and injects tokens as CSS custom properties on the root element. Tailwind config references those variables so utility classes automatically honor the tenant palette.

---

## 5. Webhook Notification Mechanics

Merchant-configurable HTTPS endpoints receive order events.

### 5.1 Configuration Model

Stored in `webhook_endpoints` `[Phase 2, not in v1 schema]`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | |
| `tenant_id` | `uuid` | |
| `merchant_id` | `uuid` | Optional — endpoint may scope to specific merchant |
| `url` | `text` | HTTPS only |
| `secret` | `text` | HMAC signing secret; auto-generated, shown once |
| `event_types` | `text[]` | Subscription filter |
| `is_active` | `boolean` | |
| `last_success_at` | `timestamptz` | |
| `last_failure_at` | `timestamptz` | |
| `consecutive_failures` | `integer` | Auto-disabled after threshold |

### 5.2 Delivery Contract

**Headers:**
```
Content-Type: application/json
X-Hyperzod-Event: order.created
X-Hyperzod-Delivery: <uuid>
X-Hyperzod-Timestamp: <unix-seconds>
X-Hyperzod-Signature: sha256=<hex-digest>
User-Agent: Hyperzod-Webhooks/1.0
```

**Signature computation:**
```
signed_payload = timestamp + "." + raw_body
X-Hyperzod-Signature = "sha256=" + hex(HMAC_SHA256(secret, signed_payload))
```

Merchants verify by recomputing HMAC and constant-time comparing. Reject requests older than 5 minutes to prevent replay.

**Body:** JSON matching event contract in `API_AND_EVENT_CONTRACTS.md` §5.

### 5.3 Event Types (v1 subset when webhooks ship in Phase 2)

| Event | Fires when |
| --- | --- |
| `order.created` | New order placed |
| `order.accepted` | `PENDING → MERCHANT_ACCEPTED` |
| `order.preparing` | Transition to `PREPARING` |
| `order.ready_for_pickup` | Transition to `READY_FOR_PICKUP` |
| `order.delivered` | Transition to `DELIVERED` |
| `order.cancelled` | Transition to `CANCELLED` (with `cancellation_reason`) |

### 5.4 Delivery Semantics

- **At-least-once.** Merchants must be idempotent using `X-Hyperzod-Delivery`.
- **Retries.** 30s, 2min, 10min, 1h, 6h — up to 5 attempts. Success = HTTP 2xx.
- **Timeout.** 5s per attempt.
- **Auto-disable.** 10 consecutive failures → `is_active = false` + merchant email.

### 5.5 Security

- Outbound from documented static IP range (for firewall allow-listing).
- HTTPS only.
- Localhost / RFC 1918 / link-local URLs rejected at save time (SSRF prevention).
- Default payload includes customer first name + order details; email/phone gated behind `include_customer_pii` scope. `[ASSUMPTION — needs confirmation once privacy policy drafted.]`

---

## 6. Redis Key Catalog

| Key | Type | TTL | Purpose |
| --- | --- | --- | --- |
| `session:{sessionId}` | STRING (JSON) | 30d sliding | Customer/merchant session |
| `cart:{tenantId}:{sessionId}` | STRING (JSON) | 7d | Storefront cart |
| `rate:{scope}:{identifier}` | STRING counter | Varies | Rate limits |
| `csrf:{sessionId}` | STRING | Session TTL | CSRF token |
| `sse:merchant-orders:{tenantId}:{merchantId}` | PUB/SUB channel | n/a | SSE fan-out |
| `sse:merchant-buffer:{tenantId}:{merchantId}` | LIST (bounded ~200) | 24h | Reconnect replay buffer |
| `webhook:queue` | STREAM | n/a | Outbound webhook queue (Phase 2) |
| `geo:drivers:{tenantId}` | GEO | n/a | Driver positions (delivery phase) |
| `driver:last-seen:{tenantId}:{driverId}` | STRING | 30s | Driver staleness marker |
| `driver:active-order:{tenantId}:{driverId}` | STRING | 20s | Cached in-progress order lookup |
| `tenant:by-domain:{host}` | STRING (uuid) | 5m | Custom-domain resolution cache |

---

## 7. Phase Roadmap Summary

### Phase 1 — White-Label Web Ordering (first paying merchant)

Everything marked "Phase 1" above. Merchant sign-up, storefront theming, menu with modifiers, order placement, live order feed (SSE), basic order lifecycle, guest checkout, email notifications, subdomain-per-tenant routing.

### Phase 2 — Growth Modules

Custom domains, SMS, webhooks, coupons, bulk import, thermal printer, refunds, scheduled orders, registered customer accounts, holiday hours.

### Phase 3 — Delivery + Native Apps

Driver network, dispatch worker (`GEOSEARCH`), tracking gateway (already built), Flutter customer + driver apps, AI menu extraction, loyalty, reviews.

`[TBD]` items in `HYPERZOD_MASTER_CONTEXT.md` §9 must be resolved before their dependent features start.
