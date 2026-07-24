# API_AND_EVENT_CONTRACTS.md

> **Purpose.** Contract-level definition of every wire-format interaction:
> REST payloads, real-time SSE streams, and outbound webhook envelopes.
> This document is the source of truth for what shapes cross the network.
>
> **Ground rules:**
> - All prices in payloads are **integer cents** — never floats, never
>   decimal strings. Frontend formats for display; backend never trusts
>   client-submitted prices and always re-derives.
> - All timestamps are **ISO 8601 with timezone** (`2026-07-23T14:35:00Z`).
> - All IDs are UUID v4 strings.
> - Every response includes a top-level `data` envelope and optional
>   `meta` for pagination. Errors use a top-level `error` envelope.
> - Every state-changing request requires the CSRF header (`X-CSRF-Token`)
>   when session-based; JWT-authenticated requests are exempt.
> - Every request runs under a tenant context. Tenant is resolved from
>   `Host` (storefront) or JWT (dashboard). Client never sends `tenant_id`
>   in a request body — that would be trivially spoofable.

---

## 1. Common Envelopes

### 1.1 Success

```json
{
  "data": { /* endpoint-specific payload */ },
  "meta": { /* optional pagination, timing, etc. */ }
}
```

### 1.2 Error

```json
{
  "error": {
    "code": "ORDER_INVALID_TRANSITION",
    "message": "Order cannot transition from PENDING to DELIVERED.",
    "details": {
      "orderId": "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
      "fromStatus": "PENDING",
      "toStatus": "DELIVERED"
    }
  }
}
```

Error `code` values are stable and machine-readable. `message` is human-readable and localized. `details` is optional and shape-specific per code.

### 1.3 Standard Error Codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | No valid session or JWT |
| `FORBIDDEN` | 403 | Authenticated but role/ownership insufficient |
| `NOT_FOUND` | 404 | Resource does not exist in current tenant (never leaks cross-tenant existence) |
| `VALIDATION_FAILED` | 422 | Request body failed validation; `details` includes per-field errors |
| `RATE_LIMITED` | 429 | Rate limit hit; `Retry-After` header included |
| `CONFLICT` | 409 | Version conflict, duplicate, or FSM violation (details specify) |
| `ORDER_INVALID_TRANSITION` | 409 | FSM guard rejected the transition |
| `MODIFIER_VALIDATION_FAILED` | 422 | Modifier selection rules violated |
| `INTERNAL_ERROR` | 500 | Unexpected server error; `details` empty in production |

### 1.4 Pagination

Cursor-based; opaque to clients:

```json
{
  "data": [ /* items */ ],
  "meta": {
    "next_cursor": "eyJpZCI6ImU0YTliMWMyIn0",
    "has_more": true
  }
}
```

Query params: `?limit=20&cursor=<opaque>`. Max `limit` is `100`.

---

## 2. Multi-Tenant Authentication

Two flavors, per `HYPERZOD_MASTER_CONTEXT.md` §4:

- **Storefront (customer).** Session cookie (`hzsid`). Anonymous sessions allowed. Guest checkout supported.
- **Dashboard (merchant).** JWT access token + refresh token. No anonymous sessions.

### 2.1 Storefront — Anonymous Session Bootstrap

Sessions are created implicitly on the first request that reaches any storefront endpoint. No explicit login endpoint required for anonymous browsing.

Response sets `Set-Cookie: hzsid=<uuid>; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`.

### 2.2 Storefront — Customer Registration (Phase 2)

`[NOT IMPLEMENTED IN v1 — deferred to Phase 2 per HYPERZOD_PRODUCT_MAPPING.md §2]`

### 2.3 Dashboard — Login

**Request** — `POST /api/v1/auth/login`

```json
{
  "email":    "owner@cheesyone.com",
  "password": "<plaintext>"
}
```

Tenant is resolved from the `Host` header (`admin.example.com` → dashboard mode → tenant resolved from the user's `tenant_id` after successful password check). Note: two users at different tenants can share an email — this is intentional per data dictionary §4.1.

**Response — 200:**

```json
{
  "data": {
    "user": {
      "id": "0f9a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
      "tenant_id": "b3d5e7a9-1122-4433-5566-778899aabbcc",
      "email": "owner@cheesyone.com",
      "full_name": "Oliver Portocarrero",
      "role": "TENANT_ADMIN"
    },
    "access_token": "<jwt>",
    "refresh_token": "<opaque>",
    "expires_in": 43200
  }
}
```

**JWT payload:**

```json
{
  "sub":      "0f9a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
  "tenantId": "b3d5e7a9-1122-4433-5566-778899aabbcc",
  "role":     "TENANT_ADMIN",
  "iat":      1745424000,
  "exp":      1745467200,
  "iss":      "hyperzod-api",
  "aud":      "hyperzod-dashboard"
}
```

- **`exp`.** 12h for access tokens.
- **`kid`.** Included in header for key rotation.
- **Refresh token.** Opaque string, stored in Redis (`refresh:{token}` → `{ userId, tenantId, issuedAt }`), 30-day TTL, single-use (rotated on refresh).

**Error responses:**

- `401 UNAUTHENTICATED` — invalid credentials. Response is intentionally identical whether the email exists or not.
- `403 FORBIDDEN` — user inactive, tenant suspended.

### 2.4 Dashboard — Refresh

`POST /api/v1/auth/refresh` — body `{ "refresh_token": "..." }` → same response shape as login. Old refresh token is invalidated atomically on issuance of the new one.

### 2.5 Dashboard — Logout

`POST /api/v1/auth/logout` — invalidates the refresh token. Access token expires naturally (short TTL).

### 2.6 Sign-Up (Merchant Onboarding)

**Request** — `POST /api/v1/auth/signup`

```json
{
  "business_name":   "The Cheesy One",
  "storefront_slug": "cheesyone",
  "owner_full_name": "Oliver Portocarrero",
  "owner_email":     "owner@cheesyone.com",
  "owner_password":  "<plaintext, >=12 chars>",
  "contact_phone":   "+61400000000",
  "timezone":        "Australia/Sydney",
  "default_currency_code": "AUD"
}
```

Server actions (transactional):
1. Insert `tenants` row.
2. Insert default `tenant_themes` row.
3. Insert `users` row for the owner with role `TENANT_ADMIN`.
4. Insert a starter `merchants` row.
5. Send email verification (delivery deferred to notification module).

**Response — 201.** Same shape as login response.

**Validation errors:**
- `422 VALIDATION_FAILED` — `details.field` identifies the offending field. Common cases: `storefront_slug` already taken, email format invalid, password too weak.

---

## 3. Storefront Catalog Retrieval

Public, unauthenticated (session cookie present but no user required).

### 3.1 Storefront Bootstrap

`GET /api/v1/storefront/bootstrap`

Returns everything a storefront needs to render its first page: tenant identity, theme, and merchant info. Called once per session.

**Response — 200:**

```json
{
  "data": {
    "tenant": {
      "id":                    "b3d5e7a9-1122-4433-5566-778899aabbcc",
      "name":                  "The Cheesy One",
      "slug":                  "cheesyone",
      "default_currency_code": "AUD",
      "default_locale":        "en-AU",
      "timezone":              "Australia/Sydney"
    },
    "merchant": {
      "id":                 "9a8b7c6d-5e4f-3210-fedc-ba9876543210",
      "name":               "The Cheesy One — Newtown",
      "description":        "Fresh, wood-fired pizzas since 2018.",
      "accepting_orders":   true,
      "avg_prep_minutes":   25,
      "contact_phone":      "+61400000000"
    },
    "theme": {
      "logo_url":       "https://cdn.example.com/tenants/b3d5.../logo.png",
      "favicon_url":    "https://cdn.example.com/tenants/b3d5.../favicon.png",
      "hero_image_url": "https://cdn.example.com/tenants/b3d5.../hero.jpg",
      "about_text":     "Family-owned since 2018.",
      "colors":         { /* see PRODUCT_MAPPING §4.1 */ },
      "typography":     { /* see PRODUCT_MAPPING §4.1 */ },
      "layout":         { "border_radius_px": 12, "container_max_width_px": 1200 },
      "hero":           { "style": "IMAGE_WITH_OVERLAY", "overlay_opacity": 0.35 },
      "social_links":   { "instagram": "https://instagram.com/cheesyone" }
    },
    "session": {
      "id":         "d1e2f3a4-b5c6-d7e8-f9a0-b1c2d3e4f5a6",
      "csrf_token": "<random-uuid>"
    }
  }
}
```

### 3.2 Full Menu

`GET /api/v1/storefront/menu`

Returns categories + products + modifier groups + modifiers in one payload. Cache-friendly (ETag on `updated_at` max across catalog).

**Response — 200:**

```json
{
  "data": {
    "categories": [
      {
        "id":          "c1a2t3e4-g5o6-r7y8-1234-567890abcdef",
        "name":        "Coffee",
        "sort_order":  1,
        "is_active":   true,
        "products": [
          {
            "id":                 "p1r2o3d4-5678-9abc-def0-123456789abc",
            "name":               "Cappuccino",
            "description":        "Classic cappuccino with silky microfoam.",
            "price_amount_cents": 40000,
            "currency_code":      "AUD",
            "status":             "ACTIVE",
            "image_url":          "https://cdn.example.com/.../cappuccino.jpg",
            "sort_order":         1,
            "modifier_groups": [
              {
                "id":              "g1r2o3u4-5678-9abc-def0-000000000001",
                "name":            "Size",
                "selection_type":  "SINGLE",
                "is_required":     true,
                "min_selections":  1,
                "max_selections":  1,
                "sort_order":      1,
                "modifiers": [
                  { "id": "m1", "name": "Small",   "delta_price_cents":  -5000, "is_default": false, "sort_order": 1 },
                  { "id": "m2", "name": "Regular", "delta_price_cents":      0, "is_default": true,  "sort_order": 2 },
                  { "id": "m3", "name": "Large",   "delta_price_cents":  10000, "is_default": false, "sort_order": 3 }
                ]
              },
              {
                "id":              "g1r2o3u4-5678-9abc-def0-000000000002",
                "name":            "Milk",
                "selection_type":  "SINGLE",
                "is_required":     true,
                "min_selections":  1,
                "max_selections":  1,
                "sort_order":      2,
                "modifiers": [
                  { "id": "m4", "name": "Whole",  "delta_price_cents":    0, "is_default": true,  "sort_order": 1 },
                  { "id": "m5", "name": "Skim",   "delta_price_cents":    0, "is_default": false, "sort_order": 2 },
                  { "id": "m6", "name": "Oat",    "delta_price_cents": 5000, "is_default": false, "sort_order": 3 },
                  { "id": "m7", "name": "Almond", "delta_price_cents": 5000, "is_default": false, "sort_order": 4 },
                  { "id": "m8", "name": "Soy",    "delta_price_cents": 5000, "is_default": false, "sort_order": 5 }
                ]
              },
              {
                "id":              "g1r2o3u4-5678-9abc-def0-000000000003",
                "name":            "Extras",
                "selection_type":  "MULTIPLE",
                "is_required":     false,
                "min_selections":  0,
                "max_selections":  3,
                "sort_order":      3,
                "modifiers": [
                  { "id": "m9",  "name": "Extra espresso shot", "delta_price_cents": 7000, "is_default": false, "sort_order": 1 },
                  { "id": "m10", "name": "Extra foam",          "delta_price_cents":    0, "is_default": false, "sort_order": 2 },
                  { "id": "m11", "name": "Vanilla syrup",       "delta_price_cents": 3000, "is_default": false, "sort_order": 3 },
                  { "id": "m12", "name": "Caramel syrup",       "delta_price_cents": 3000, "is_default": false, "sort_order": 4 }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "meta": {
    "menu_updated_at": "2026-07-22T09:15:00Z"
  }
}
```

Server sets `ETag: "menu-<hash>"` and `Cache-Control: public, max-age=60, must-revalidate`.

### 3.3 Single Product

`GET /api/v1/storefront/products/{productId}` — same product shape as above. Useful for deep-links.

---

## 4. Checkout

### 4.1 Cart Operations (Phase 1)

Cart lives in the session's Redis record; there's no dedicated `carts` table for v1. Cart operations mutate the session's `cart` field.

`GET /api/v1/storefront/cart` — returns current cart with server-computed totals.

`PUT /api/v1/storefront/cart` — replaces the entire cart. Body shape identical to the `items[]` array in the checkout request below. Server recomputes totals and returns the same payload as `GET`.

**Response:**

```json
{
  "data": {
    "items": [
      {
        "line_id":            "l1",
        "product_id":         "p1r2o3d4-5678-9abc-def0-123456789abc",
        "product_name":       "Cappuccino",
        "quantity":           2,
        "selected_modifiers": [
          { "id": "m2", "group_name": "Size", "name": "Regular", "delta_price_cents":    0 },
          { "id": "m6", "group_name": "Milk", "name": "Oat",     "delta_price_cents": 5000 },
          { "id": "m9", "group_name": "Extras", "name": "Extra espresso shot", "delta_price_cents": 7000 }
        ],
        "unit_price_cents":  52000,
        "line_total_cents":  104000,
        "notes":             null
      }
    ],
    "subtotal_cents":     104000,
    "delivery_fee_cents":      0,
    "tax_cents":              0,
    "discount_cents":         0,
    "total_cents":       104000,
    "currency_code":     "AUD"
  }
}
```

### 4.2 Checkout — Place Order

`POST /api/v1/storefront/checkout`

**Request:**

```json
{
  "fulfillment_type": "PICKUP",
  "customer": {
    "full_name":     "Priya Sharma",
    "contact_email": "priya@example.com",
    "contact_phone": "+61400111222"
  },
  "delivery_address": null,
  "notes":            "Please make it extra hot.",
  "items": [
    {
      "product_id":            "p1r2o3d4-5678-9abc-def0-123456789abc",
      "quantity":              2,
      "selected_modifier_ids": ["m2", "m6", "m9"],
      "notes":                 null
    }
  ]
}
```

**Client submits only IDs and quantities. Not prices.**

### 4.3 Server-Side Processing

1. Load session; ensure tenant matches storefront host.
2. Open transaction, `SET LOCAL app.current_tenant`.
3. For each `items[i]`:
   - Load product by `(tenant_id, product_id)` and ensure `status = ACTIVE`.
   - Load all `product_modifier_groups` for that product.
   - Validate `selected_modifier_ids` against modifier group rules (`SINGLE`/`MULTIPLE`, `is_required`, `min`/`max`, membership) — see `HYPERZOD_PRODUCT_MAPPING.md` §3.5.
   - Compute `unit_price_cents = product.price_amount_cents + Σ(modifier.delta_price_cents)`.
   - Compute `line_total_cents = unit_price_cents × quantity`.
4. Sum `subtotal_cents`. Compute `delivery_fee_cents` (`0` in v1 unless delivery flag), `tax_cents` (`[TBD region-dependent — VAT/GST rules]`), `total_cents = subtotal + delivery + tax − discount`.
5. Generate `order_number` — `[ASSUMPTION: monotonic per-merchant, zero-padded, e.g. `ORD-20260723-00042`]`.
6. Insert `orders`, `order_items`, `order_item_modifiers` rows atomically.
7. `EventEmitter.emit(OrderCreatedEvent)` → publishes to SSE channel + appends to buffer LIST.
8. Return created order.

**Response — 201:**

```json
{
  "data": {
    "order": {
      "id":                "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
      "order_number":      "ORD-20260723-00042",
      "status":            "PENDING",
      "fulfillment_type":  "PICKUP",
      "subtotal_cents":    104000,
      "delivery_fee_cents":     0,
      "tax_cents":              0,
      "discount_cents":         0,
      "total_cents":       104000,
      "currency_code":     "AUD",
      "placed_at":         "2026-07-23T14:35:00Z",
      "items": [ /* mirror of the line items with computed prices */ ]
    }
  }
}
```

**Errors:**

- `422 MODIFIER_VALIDATION_FAILED` with `details.item_index` and `details.reason` (`REQUIRED_GROUP_MISSING`, `TOO_MANY_SELECTIONS`, `MODIFIER_NOT_IN_PRODUCT`, etc.).
- `422 VALIDATION_FAILED` — schema-level (missing customer email, etc.).
- `409 CONFLICT` with `code: PRODUCT_UNAVAILABLE` if a product transitioned to `OUT_OF_STOCK`/`ARCHIVED` between cart and checkout.
- `503 MERCHANT_NOT_ACCEPTING` if merchant toggled `accepting_orders = false`.

Payment is a separate step in Phase 2. In v1, order is placed in `PENDING` and the merchant accepts/declines from the dashboard.

### 4.4 Order Status Poll (public)

`GET /api/v1/storefront/orders/{orderId}?token=<one-time-token>`

Customers get a one-time-view token in the confirmation email (Phase 2 will replace with account-based access). Session that placed the order can also fetch without a token.

Returns the same order shape as the checkout response, with current `status` and any lifecycle timestamps populated.

---

## 5. Merchant Order Real-Time (SSE)

### 5.1 Endpoint

`GET /api/v1/dashboard/merchants/{merchantId}/orders/stream`

**Headers:**
```
Authorization: Bearer <jwt>
Accept: text/event-stream
Cache-Control: no-cache
Last-Event-ID: <optional — last event id received on prior connection>
```

**Response:**
- `HTTP/1.1 200 OK`
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (if fronted by Nginx)

### 5.2 Wire Format

Each event follows the SSE spec:

```
id: 01H9K3T5V6XW7YZ8A9B0C1D2E3
event: order.created
data: {"order_id":"e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c","order_number":"ORD-20260723-00042","status":"PENDING","total_cents":104000,"currency_code":"AUD","placed_at":"2026-07-23T14:35:00Z","customer_full_name":"Priya Sharma","item_count":1}

id: 01H9K3T7X8Y9Z0A1B2C3D4E5F6
event: order.status_changed
data: {"order_id":"e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c","order_number":"ORD-20260723-00042","previous_status":"PENDING","new_status":"MERCHANT_ACCEPTED","changed_at":"2026-07-23T14:36:12Z"}

:heartbeat 2026-07-23T14:36:30Z

```

- **`id`** — ULID; monotonic per (tenant, merchant); used by client for `Last-Event-ID`.
- **`event`** — one of `order.created`, `order.status_changed`.
- **`data`** — single-line minified JSON.
- Heartbeat comment sent every 15s to keep proxies from dropping the connection.

### 5.3 `order.created` Data Shape

```json
{
  "order_id":           "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
  "order_number":       "ORD-20260723-00042",
  "status":             "PENDING",
  "fulfillment_type":   "PICKUP",
  "total_cents":        104000,
  "currency_code":      "AUD",
  "placed_at":          "2026-07-23T14:35:00Z",
  "customer_full_name": "Priya Sharma",
  "item_count":         1
}
```

Deliberately compact — dashboard fetches full order via REST when the merchant clicks in. Keeps SSE payload small for high-volume merchants.

### 5.4 `order.status_changed` Data Shape

```json
{
  "order_id":         "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
  "order_number":     "ORD-20260723-00042",
  "previous_status":  "PENDING",
  "new_status":       "MERCHANT_ACCEPTED",
  "changed_at":       "2026-07-23T14:36:12Z"
}
```

### 5.5 Reconnection

Browser auto-reconnects and sends `Last-Event-ID`. Server:

1. Reads the buffer LIST `sse:merchant-buffer:{tenantId}:{merchantId}` (last ~200 events).
2. Replays all events with `id > Last-Event-ID` before subscribing to live pub/sub.
3. If `Last-Event-ID` is older than the oldest buffered event, server sends a special `event: catchup_gap` payload; dashboard responds by triggering a full REST refetch of active orders.

### 5.6 Auth Middleware

- JWT verified per connection.
- `role` must be `TENANT_ADMIN`, `MERCHANT_OWNER`, or `MERCHANT_STAFF`.
- `merchantId` in URL must be scoped to the authenticated user's tenant AND the user must have permission for that merchant.
- Any failure closes the connection immediately with a `4xx` status before any events are sent.

---

## 6. Merchant Dashboard — Order Transitions

`POST /api/v1/dashboard/orders/{orderId}/transition`

Wraps `OrdersService.transition()` from `orders.service.ts`.

**Request:**

```json
{
  "target_status": "MERCHANT_ACCEPTED",
  "reason":        null
}
```

For `CANCELLED` and `DELIVERY_FAILED`, `reason` is required.

**Response — 200:** Full order shape (same as GET single order).

**Errors:**
- `409 ORDER_INVALID_TRANSITION` with `details.from_status` and `details.to_status`.
- `404 NOT_FOUND` — order not in caller's tenant.

---

## 7. Outbound Webhooks (Phase 2)

Full details in `HYPERZOD_PRODUCT_MAPPING.md` §5. Event payload contract shown here for completeness.

### 7.1 Payload Envelope

Every webhook POST body:

```json
{
  "id":         "01H9K3T5V6XW7YZ8A9B0C1D2E3",
  "type":       "order.created",
  "created_at": "2026-07-23T14:35:00Z",
  "tenant_id":  "b3d5e7a9-1122-4433-5566-778899aabbcc",
  "merchant_id":"9a8b7c6d-5e4f-3210-fedc-ba9876543210",
  "data": { /* type-specific */ }
}
```

### 7.2 `order.created` Data

Full order including line items and modifiers. Customer PII fields (`contact_email`, `contact_phone`) present only if the endpoint has `include_customer_pii = true`.

```json
{
  "order": {
    "id":               "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
    "order_number":     "ORD-20260723-00042",
    "status":           "PENDING",
    "fulfillment_type": "PICKUP",
    "subtotal_cents":   104000,
    "delivery_fee_cents": 0,
    "tax_cents":        0,
    "discount_cents":   0,
    "total_cents":      104000,
    "currency_code":    "AUD",
    "placed_at":        "2026-07-23T14:35:00Z",
    "customer": {
      "full_name":     "Priya Sharma",
      "contact_email": "priya@example.com",
      "contact_phone": "+61400111222"
    },
    "delivery_address": null,
    "notes":            "Please make it extra hot.",
    "items": [
      {
        "id":                "l1",
        "product_id":        "p1r2o3d4-5678-9abc-def0-123456789abc",
        "product_name":      "Cappuccino",
        "unit_price_cents":  52000,
        "quantity":          2,
        "line_total_cents":  104000,
        "notes":             null,
        "modifiers": [
          { "group_name": "Size",   "modifier_name": "Regular",             "delta_price_cents":    0 },
          { "group_name": "Milk",   "modifier_name": "Oat",                 "delta_price_cents": 5000 },
          { "group_name": "Extras", "modifier_name": "Extra espresso shot", "delta_price_cents": 7000 }
        ]
      }
    ]
  }
}
```

### 7.3 `order.status_changed` Data (fires for accepted/preparing/ready/delivered/cancelled)

```json
{
  "order_id":         "e4a9b1c2-8c1d-4a3e-9b7f-1d2f4e5a6b7c",
  "order_number":     "ORD-20260723-00042",
  "previous_status":  "PENDING",
  "new_status":       "MERCHANT_ACCEPTED",
  "changed_at":       "2026-07-23T14:36:12Z",
  "cancellation_reason": null
}
```

Signature and delivery mechanics per `HYPERZOD_PRODUCT_MAPPING.md` §5.2 and §5.4.

---

## 8. Merchant Dashboard — Catalog CRUD (Reference)

Not exhaustive — patterns for one resource, others follow the same shape.

### 8.1 Create Product

`POST /api/v1/dashboard/merchants/{merchantId}/products`

```json
{
  "category_id":        "c1a2t3e4-g5o6-r7y8-1234-567890abcdef",
  "name":               "Flat White",
  "description":        "Double ristretto with silky milk.",
  "price_amount_cents": 38000,
  "image_url":          "https://cdn.example.com/tenants/b3d5.../uploads/xyz.jpg",
  "status":             "ACTIVE",
  "sort_order":         2
}
```

Returns full product incl. empty modifier_groups array. **Currency is not accepted in the request** — inherited from `tenants.default_currency_code`.

### 8.2 Add Modifier Group

`POST /api/v1/dashboard/products/{productId}/modifier-groups`

```json
{
  "name":           "Milk",
  "selection_type": "SINGLE",
  "is_required":    true,
  "min_selections": 1,
  "max_selections": 1,
  "sort_order":     2
}
```

### 8.3 Add Modifier

`POST /api/v1/dashboard/modifier-groups/{groupId}/modifiers`

```json
{
  "name":               "Oat milk",
  "delta_price_cents":  5000,
  "is_default":         false,
  "sort_order":         3
}
```

---

## 9. Theme Update

`PUT /api/v1/dashboard/theme` — replaces the entire theme document. Partial `PATCH` deferred until v1 usage patterns are clearer.

**Request:** JSON matching the theme contract in `HYPERZOD_PRODUCT_MAPPING.md` §4.1.

**Validation errors:**

- `422 VALIDATION_FAILED` with `details.field` — e.g. `colors.primary` not a valid hex, `typography.body_font_family` not in whitelist, `logo_url` not on platform CDN.

---

## 10. Rate Limits

Enforced per (tenant, route-group) using Redis token buckets.

| Route group | Limit | Scope |
| --- | --- | --- |
| Storefront read (bootstrap, menu, product) | 300 req/min | Per IP + tenant |
| Storefront cart mutations | 60 req/min | Per session |
| Storefront checkout | 5 req/min | Per session |
| Auth (login, signup, refresh) | 10 req/min | Per IP |
| Dashboard reads | 300 req/min | Per user |
| Dashboard writes | 60 req/min | Per user |

Exceeded: `429 RATE_LIMITED` with `Retry-After` header in seconds.

---

## 11. Idempotency

State-changing operations that are safe to retry accept an `Idempotency-Key` request header (UUID). Server stores `(tenant_id, idempotency_key) → response` for 24h. Retries with the same key return the original response verbatim without re-executing.

Applies to: `POST /checkout`, `POST /transition`, all `POST` catalog CRUD.

---

## 12. Versioning

- All endpoints prefixed with `/api/v1/`.
- Breaking changes bump to `/api/v2/`; `/api/v1/` supported alongside for at least 6 months.
- Non-breaking additions (new fields, new endpoints) do not bump the version.
- Client SDKs and the storefront SPA send `X-Client-Version` header for observability, not for behavior.
