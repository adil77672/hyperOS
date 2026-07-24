# SYSTEM_DATA_DICTIONARY.md

> **Purpose.** Column-level reference for the PostgreSQL schema.
> Regenerated from the prior version with several breaking changes:
>
> 1. **All monetary columns changed from `numeric(12,2)` to `bigint`** —
>    stored as integer minor units (cents). This is a schema-breaking change
>    to `backend-server/src/database/schema.sql`. The prior DDL file must be
>    updated to match this dictionary before the next migration ships.
> 2. **New tables** introduced: `tenant_themes`, `tenant_custom_domains`,
>    `product_modifier_groups`, `product_modifiers`, `order_item_modifiers`,
>    `merchant_operating_hours`.
> 3. **All PKs remain `uuid` v4** via `gen_random_uuid()`.
>
> If this document and `schema.sql` disagree, `schema.sql` is authoritative —
> update this document. If code and `schema.sql` disagree, `schema.sql` is
> still authoritative. Nothing is authoritative over `schema.sql`.

---

## 1. Conventions

- **Primary keys.** `uuid`, `DEFAULT gen_random_uuid()`.
- **Tenant scoping.** Every business table has `tenant_id uuid NOT NULL` and a corresponding RLS policy.
- **Composite FKs.** All child → parent references use `(tenant_id, parent_id)` against `UNIQUE (tenant_id, id)` on the parent.
- **Money.** `bigint`, non-negative, representing minor units of the tenant's default currency. Zero is a valid value. A separate `currency_code char(3)` column travels with monetary rows for auditability even though currency is resolved from `tenants.default_currency_code` at runtime.
- **Timestamps.** `timestamptz NOT NULL DEFAULT now()` for `created_at`. `updated_at timestamptz NOT NULL DEFAULT now()` maintained by `set_updated_at()` `BEFORE UPDATE` trigger.
- **RLS.** Every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Policy `tenant_isolation`: `USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())`.

---

## 2. Extensions and Types

### 2.1 Extensions

| Extension | Purpose |
| --- | --- |
| `pgcrypto` | `gen_random_uuid()` |
| `citext` | Case-insensitive `email`, `slug` |
| `postgis` | Geometry types for merchant point + delivery zones (Phase 3) |

### 2.2 Enum Types

| Type | Values |
| --- | --- |
| `tenant_status` | `ACTIVE`, `SUSPENDED`, `CANCELLED` |
| `user_role` | `SUPER_ADMIN`, `TENANT_ADMIN`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `DRIVER`, `CUSTOMER` |
| `merchant_status` | `PENDING_APPROVAL`, `ACTIVE`, `SUSPENDED`, `CLOSED` |
| `product_status` | `ACTIVE`, `OUT_OF_STOCK`, `ARCHIVED` |
| `order_status` | `PENDING`, `MERCHANT_ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `DELIVERY_FAILED` |
| `order_fulfillment_type` | `PICKUP`, `DELIVERY` |
| `modifier_selection_type` | `SINGLE`, `MULTIPLE` |
| `custom_domain_status` | `PENDING_VERIFICATION`, `VERIFIED`, `SSL_ISSUED`, `ACTIVE`, `FAILED` |

---

## 3. Tenant Layer

### 3.1 `tenants`

Root of the tenancy tree. Not itself tenant-scoped.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | NO | — | Merchant business name |
| `slug` | `citext` | NO | — | Unique globally; `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$` |
| `status` | `tenant_status` | NO | `'ACTIVE'` | |
| `default_currency_code` | `char(3)` | NO | `[TBD region-dependent default]` | Regex `^[A-Z]{3}$` |
| `default_locale` | `text` | NO | `[TBD region-dependent default]` | BCP 47 tag |
| `timezone` | `text` | NO | `[TBD region-dependent default]` | IANA name |
| `contact_email` | `citext` | NO | — | |
| `metadata` | `jsonb` | NO | `'{}'::jsonb` | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `tenants_slug_key UNIQUE (slug)`
- `tenants_slug_format_chk` (regex above)
- `tenants_currency_chk CHECK (default_currency_code ~ '^[A-Z]{3}$')`

**Indexes.**
- `idx_tenants_status` on `(status)`

**RLS.** Policy `tenant_self_visibility`: `USING (id = current_tenant_id())`.

---

### 3.2 `tenant_themes`

Per-tenant white-label configuration. Exactly one row per tenant.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | FK → `tenants(id)`; **UNIQUE** — one theme per tenant |
| `logo_url` | `text` | YES | — | Must be on platform CDN domain |
| `favicon_url` | `text` | YES | — | Must be on platform CDN domain |
| `hero_image_url` | `text` | YES | — | Must be on platform CDN domain |
| `about_text` | `text` | YES | — | Plain text, no HTML |
| `colors` | `jsonb` | NO | See default below | Theme tokens |
| `typography` | `jsonb` | NO | See default below | Font tokens |
| `layout` | `jsonb` | NO | `'{"border_radius_px": 8, "container_max_width_px": 1200}'::jsonb` | |
| `hero` | `jsonb` | NO | `'{"style": "IMAGE_WITH_OVERLAY", "overlay_opacity": 0.3}'::jsonb` | |
| `social_links` | `jsonb` | NO | `'{}'::jsonb` | Whitelisted platform keys only |
| `legal_pages` | `jsonb` | NO | `'{}'::jsonb` | Merchant-editable T&C / Privacy (Phase 2) |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Default `colors`:**
```json
{"primary":"#0F5132","secondary":"#D4A017","accent":"#B23A48",
 "background":"#FFFFFF","foreground":"#101828","muted":"#F2F4F7",
 "border":"#EAECF0","danger":"#B42318","success":"#027A48"}
```

**Default `typography`:**
```json
{"heading_font_family":"Inter, system-ui, sans-serif",
 "body_font_family":"Inter, system-ui, sans-serif",
 "base_font_size_px":16,"heading_weight":600,"body_weight":400}
```

**Constraints.**
- `tenant_themes_tenant_fk` → `tenants(id)` `ON DELETE CASCADE`
- `tenant_themes_tenant_key UNIQUE (tenant_id)` — one theme per tenant

**Indexes.**
- Covered by the UNIQUE.

**RLS.** Policy `tenant_isolation`.

**Application-layer validation** (not enforced by DDL — enforced by DTO):
- Colors match `^#[0-9A-Fa-f]{6}$`.
- Font families are on the whitelisted font list.
- Image URLs are on the platform CDN.

---

### 3.3 `tenant_custom_domains`

Phase 2 — merchant-brought domains.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | FK → `tenants(id)` |
| `hostname` | `citext` | NO | — | Fully qualified domain name |
| `status` | `custom_domain_status` | NO | `'PENDING_VERIFICATION'` | |
| `verification_token` | `text` | NO | — | Value the merchant places in TXT record |
| `verified_at` | `timestamptz` | YES | — | |
| `ssl_issued_at` | `timestamptz` | YES | — | |
| `last_check_at` | `timestamptz` | YES | — | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `tenant_custom_domains_tenant_fk` → `tenants(id)` `ON DELETE CASCADE`
- `tenant_custom_domains_hostname_key UNIQUE (hostname)` — a hostname maps to at most one tenant globally

**Indexes.**
- `idx_tenant_custom_domains_tenant` on `(tenant_id, status)`

**RLS.** Policy `tenant_isolation`.

---

## 4. Identity Layer

### 4.1 `users`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | FK → `tenants(id)` |
| `email` | `citext` | NO | — | Unique per tenant, not globally |
| `phone` | `text` | YES | — | E.164 format when present |
| `password_hash` | `text` | YES | — | Nullable to support future SSO-only users |
| `full_name` | `text` | NO | — | |
| `role` | `user_role` | NO | `'CUSTOMER'` | |
| `is_active` | `boolean` | NO | `true` | |
| `email_verified_at` | `timestamptz` | YES | — | |
| `last_login_at` | `timestamptz` | YES | — | |
| `metadata` | `jsonb` | NO | `'{}'::jsonb` | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `users_tenant_fk` → `tenants(id)`
- `users_tenant_email_key UNIQUE (tenant_id, email)`
- `users_tenant_id_uq UNIQUE (tenant_id, id)`

**Indexes.**
- `idx_users_tenant_role` on `(tenant_id, role)`
- `idx_users_active_drivers` on `(tenant_id)` `WHERE role = 'DRIVER' AND is_active`

**RLS.** Policy `tenant_isolation`.

---

## 5. Catalog Layer

### 5.1 `merchants`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `owner_user_id` | `uuid` | NO | — | Composite FK → `users(tenant_id, id)` |
| `name` | `text` | NO | — | |
| `slug` | `citext` | NO | — | Unique per tenant |
| `description` | `text` | YES | — | |
| `status` | `merchant_status` | NO | `'PENDING_APPROVAL'` | |
| `contact_phone` | `text` | YES | — | |
| `accepting_orders` | `boolean` | NO | `true` | Snooze switch |
| `avg_prep_minutes` | `integer` | NO | `20` | For customer ETAs |
| `location` | `geometry(Point, 4326)` | YES | — | Nullable in v1 (Phase 3 requires) |
| `delivery_zone` | `geometry(MultiPolygon, 4326)` | YES | — | Phase 2+ |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `merchants_tenant_fk` → `tenants(id)`
- `merchants_owner_fk (tenant_id, owner_user_id)` → `users(tenant_id, id)`
- `merchants_tenant_slug_key UNIQUE (tenant_id, slug)`
- `merchants_tenant_id_uq UNIQUE (tenant_id, id)`
- `merchants_delivery_zone_valid_chk CHECK (delivery_zone IS NULL OR ST_IsValid(delivery_zone))`
- `merchants_prep_chk CHECK (avg_prep_minutes >= 0)`

**Indexes.**
- `idx_merchants_tenant_status` on `(tenant_id, status)`
- `idx_merchants_owner` on `(tenant_id, owner_user_id)`
- `idx_merchants_location_gist` on `location` USING GIST
- `idx_merchants_zone_gist` on `delivery_zone` USING GIST

**RLS.** Policy `tenant_isolation`.

---

### 5.2 `merchant_operating_hours`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `merchant_id` | `uuid` | NO | — | Composite FK → `merchants(tenant_id, id)` `ON DELETE CASCADE` |
| `day_of_week` | `smallint` | NO | — | `0`=Sun … `6`=Sat |
| `opens_at` | `time` | NO | — | Merchant local time (timezone from `tenants.timezone`) |
| `closes_at` | `time` | NO | — | If earlier than `opens_at`, means overnight (e.g. 22:00 → 02:00) |

**Constraints.**
- `moh_tenant_fk`, `moh_merchant_fk`
- `moh_day_chk CHECK (day_of_week BETWEEN 0 AND 6)`
- `moh_merchant_day_key UNIQUE (tenant_id, merchant_id, day_of_week, opens_at)` — allows multi-window days (breakfast + dinner)

**Indexes.**
- `idx_moh_merchant` on `(tenant_id, merchant_id, day_of_week)`

**RLS.** Policy `tenant_isolation`.

---

### 5.3 `categories`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `merchant_id` | `uuid` | NO | — | Composite FK → `merchants(tenant_id, id)` `ON DELETE CASCADE` |
| `name` | `text` | NO | — | |
| `sort_order` | `integer` | NO | `0` | |
| `is_active` | `boolean` | NO | `true` | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `categories_tenant_fk`, `categories_merchant_fk`
- `categories_tenant_merchant_name_key UNIQUE (tenant_id, merchant_id, name)`
- `categories_tenant_id_uq UNIQUE (tenant_id, id)`

**Indexes.**
- `idx_categories_merchant` on `(tenant_id, merchant_id, sort_order)`

**RLS.** Policy `tenant_isolation`.

---

### 5.4 `products`

**Breaking change from prior schema:** `price_amount numeric(12,2)` replaced by `price_amount_cents bigint`.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `merchant_id` | `uuid` | NO | — | Composite FK → `merchants(tenant_id, id)` `ON DELETE CASCADE` |
| `category_id` | `uuid` | YES | — | Composite FK → `categories(tenant_id, id)` `ON DELETE SET NULL` |
| `name` | `text` | NO | — | |
| `description` | `text` | YES | — | |
| `price_amount_cents` | `bigint` | NO | — | `>= 0`. Integer minor units. |
| `currency_code` | `char(3)` | NO | Inherits `tenants.default_currency_code` at write time (app-layer) | |
| `status` | `product_status` | NO | `'ACTIVE'` | |
| `image_url` | `text` | YES | — | |
| `sort_order` | `integer` | NO | `0` | Within category |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `products_tenant_fk`, `products_merchant_fk`, `products_category_fk`
- `products_price_chk CHECK (price_amount_cents >= 0)`
- `products_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')`
- `products_tenant_id_uq UNIQUE (tenant_id, id)`

**Indexes.**
- `idx_products_merchant` on `(tenant_id, merchant_id, sort_order)`
- `idx_products_category` on `(tenant_id, category_id)`
- `idx_products_active` on `(tenant_id, merchant_id)` `WHERE status = 'ACTIVE'`

**RLS.** Policy `tenant_isolation`.

---

### 5.5 `product_modifier_groups`

A group of options attached to a product (e.g. "Milk", "Size", "Extras").

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `product_id` | `uuid` | NO | — | Composite FK → `products(tenant_id, id)` `ON DELETE CASCADE` |
| `name` | `text` | NO | — | Merchant-facing label |
| `selection_type` | `modifier_selection_type` | NO | — | `SINGLE` or `MULTIPLE` |
| `is_required` | `boolean` | NO | `false` | |
| `min_selections` | `integer` | NO | `0` | Meaningful only for `MULTIPLE` |
| `max_selections` | `integer` | NO | `1` | For `SINGLE`, effectively `1` |
| `sort_order` | `integer` | NO | `0` | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `pmg_tenant_fk`, `pmg_product_fk`
- `pmg_min_chk CHECK (min_selections >= 0)`
- `pmg_max_chk CHECK (max_selections >= min_selections)`
- `pmg_single_chk CHECK ( selection_type = 'MULTIPLE' OR (min_selections IN (0,1) AND max_selections = 1) )`
- `pmg_required_chk CHECK ( NOT is_required OR min_selections >= 1 )`
- `pmg_tenant_id_uq UNIQUE (tenant_id, id)`

**Indexes.**
- `idx_pmg_product` on `(tenant_id, product_id, sort_order)`

**RLS.** Policy `tenant_isolation`.

---

### 5.6 `product_modifiers`

Individual options within a modifier group.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `group_id` | `uuid` | NO | — | Composite FK → `product_modifier_groups(tenant_id, id)` `ON DELETE CASCADE` |
| `name` | `text` | NO | — | Customer-facing label |
| `delta_price_cents` | `bigint` | NO | `0` | Signed — can be negative (e.g. "smaller size"). |
| `is_default` | `boolean` | NO | `false` | Preselected in the storefront |
| `is_active` | `boolean` | NO | `true` | |
| `sort_order` | `integer` | NO | `0` | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- `pm_tenant_fk`, `pm_group_fk`
- `pm_tenant_id_uq UNIQUE (tenant_id, id)`
- No non-negativity check on `delta_price_cents` — negative deltas are valid (size discounts).

**Indexes.**
- `idx_pm_group` on `(tenant_id, group_id, sort_order)`

**RLS.** Policy `tenant_isolation`.

---

## 6. Order Layer

### 6.1 `orders`

**Breaking changes from prior schema:**
- All monetary columns changed from `numeric(12,2)` to `bigint` (cents suffix).
- Added `fulfillment_type` column.
- Added `customer_contact_email`, `customer_contact_phone`, `customer_full_name` — for guest checkout without a `users` row.
- `customer_id` becomes **nullable** (guest orders have no user row until Phase 2 customer accounts ship).

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `merchant_id` | `uuid` | NO | — | Composite FK → `merchants(tenant_id, id)` |
| `customer_id` | `uuid` | YES | — | Composite FK → `users(tenant_id, id)`; nullable for guest orders |
| `driver_id` | `uuid` | YES | — | Composite FK → `users(tenant_id, id)`; Phase 3 |
| `order_number` | `text` | NO | — | Human-facing; unique per tenant; app-generated |
| `status` | `order_status` | NO | `'PENDING'` | FSM-guarded |
| `fulfillment_type` | `order_fulfillment_type` | NO | — | `PICKUP` or `DELIVERY` |
| `subtotal_cents` | `bigint` | NO | `0` | `>= 0` |
| `delivery_fee_cents` | `bigint` | NO | `0` | `>= 0` |
| `tax_cents` | `bigint` | NO | `0` | `>= 0` |
| `discount_cents` | `bigint` | NO | `0` | `>= 0`; Phase 2 |
| `total_cents` | `bigint` | NO | `0` | `>= 0`; `subtotal + delivery_fee + tax - discount` |
| `currency_code` | `char(3)` | NO | `'USD'` | Regex `^[A-Z]{3}$` |
| `customer_full_name` | `text` | NO | — | Snapshot for guest orders |
| `customer_contact_email` | `citext` | NO | — | Snapshot |
| `customer_contact_phone` | `text` | NO | — | Snapshot |
| `delivery_address` | `text` | YES | — | Required when `fulfillment_type = DELIVERY` (app-layer) |
| `delivery_location` | `geometry(Point, 4326)` | YES | — | |
| `notes` | `text` | YES | — | Customer-supplied |
| `placed_at` | `timestamptz` | NO | `now()` | |
| `accepted_at` | `timestamptz` | YES | — | Set on `MERCHANT_ACCEPTED` |
| `ready_at` | `timestamptz` | YES | — | Set on `READY_FOR_PICKUP` |
| `dispatched_at` | `timestamptz` | YES | — | Set on `OUT_FOR_DELIVERY` |
| `delivered_at` | `timestamptz` | YES | — | Set on `DELIVERED` |
| `cancelled_at` | `timestamptz` | YES | — | Set on `CANCELLED` |
| `cancellation_reason` | `text` | YES | — | Populated on `CANCELLED` / `DELIVERY_FAILED` |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger-maintained |

**Constraints.**
- Composite FKs: `orders_tenant_fk`, `orders_merchant_fk`, `orders_customer_fk`, `orders_driver_fk`
- `orders_tenant_number_key UNIQUE (tenant_id, order_number)`
- `orders_tenant_id_uq UNIQUE (tenant_id, id)`
- `orders_totals_chk CHECK (subtotal_cents >= 0 AND delivery_fee_cents >= 0 AND tax_cents >= 0 AND discount_cents >= 0 AND total_cents >= 0)`
- `orders_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')`

**Indexes.**
- `idx_orders_merchant` on `(tenant_id, merchant_id, placed_at DESC)`
- `idx_orders_customer` on `(tenant_id, customer_id, placed_at DESC)` `WHERE customer_id IS NOT NULL`
- `idx_orders_driver` on `(tenant_id, driver_id)` `WHERE driver_id IS NOT NULL`
- `idx_orders_active_status` on `(tenant_id, status)` `WHERE status NOT IN ('DELIVERED','CANCELLED','DELIVERY_FAILED')`
- `idx_orders_delivery_location_gist` on `delivery_location` USING GIST

**Triggers.**
- `trg_orders_updated_at` — `set_updated_at()`
- `trg_orders_status_fsm` — `BEFORE UPDATE OF status`, calls `enforce_order_status_transition()`

**RLS.** Policy `tenant_isolation`.

---

### 6.2 `order_items`

**Breaking changes:** `unit_price`, `line_total` renamed with `_cents` suffix and typed `bigint`.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `order_id` | `uuid` | NO | — | Composite FK → `orders(tenant_id, id)` `ON DELETE CASCADE` |
| `product_id` | `uuid` | YES | — | Composite FK → `products(tenant_id, id)` `ON DELETE SET NULL` |
| `product_name` | `text` | NO | — | Snapshot at purchase |
| `unit_price_cents` | `bigint` | NO | — | Snapshot — includes all selected modifier deltas |
| `quantity` | `integer` | NO | — | `> 0` |
| `line_total_cents` | `bigint` | NO | — | `unit_price_cents * quantity` |
| `notes` | `text` | YES | — | Per-item customer note |
| `sort_order` | `integer` | NO | `0` | Display order within the order |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints.**
- `oi_tenant_fk`, `oi_order_fk`, `oi_product_fk`
- `oi_qty_chk CHECK (quantity > 0)`
- `oi_price_chk CHECK (unit_price_cents >= 0 AND line_total_cents >= 0)`
- `oi_tenant_id_uq UNIQUE (tenant_id, id)`

**Indexes.**
- `idx_oi_order` on `(tenant_id, order_id)`
- `idx_oi_product` on `(tenant_id, product_id)`

**RLS.** Policy `tenant_isolation`.

**Note.** No `updated_at` — line items are immutable once written.

---

### 6.3 `order_item_modifiers`

Snapshot of which modifiers were selected on each line item.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid` | NO | — | |
| `order_item_id` | `uuid` | NO | — | Composite FK → `order_items(tenant_id, id)` `ON DELETE CASCADE` |
| `modifier_id` | `uuid` | YES | — | Composite FK → `product_modifiers(tenant_id, id)` `ON DELETE SET NULL` |
| `group_name` | `text` | NO | — | Snapshot of `product_modifier_groups.name` |
| `modifier_name` | `text` | NO | — | Snapshot of `product_modifiers.name` |
| `delta_price_cents` | `bigint` | NO | — | Snapshot at purchase (may differ from current) |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints.**
- `oim_tenant_fk`, `oim_order_item_fk`, `oim_modifier_fk`

**Indexes.**
- `idx_oim_order_item` on `(tenant_id, order_item_id)`

**RLS.** Policy `tenant_isolation`.

**Note.** No `updated_at` — modifier snapshots are immutable.

---

## 7. Foreign Key Design Summary

Every parent table has `UNIQUE (tenant_id, id)`. Every child FK uses composite `(tenant_id, parent_id)` against it. Structurally impossible for a child row to reference a parent in a different tenant.

`ON DELETE` policy summary:

| Relationship | Behavior | Rationale |
| --- | --- | --- |
| `tenants` → anything | `RESTRICT` | Tenant deletion is a control-plane operation |
| `tenants` → `tenant_themes`, `tenant_custom_domains` | `CASCADE` | Configuration is meaningless without the tenant |
| `merchants` → `categories`, `products`, `merchant_operating_hours` | `CASCADE` | Menu meaningless without merchant |
| `categories` → `products` | `SET NULL` | Preserve product; uncategorize it |
| `products` → `product_modifier_groups` | `CASCADE` | Groups meaningless without product |
| `product_modifier_groups` → `product_modifiers` | `CASCADE` | Modifiers meaningless without group |
| `products` → `order_items` | `SET NULL` | Preserve ledger |
| `product_modifiers` → `order_item_modifiers` | `SET NULL` | Preserve ledger |
| `orders` → `order_items` | `CASCADE` | Line items lifecycle-bound to order |
| `order_items` → `order_item_modifiers` | `CASCADE` | Modifier snapshots lifecycle-bound to line item |
| `users` → `orders` | `RESTRICT` | Never allow deleting a user with orders |

---

## 8. Row-Level Security Summary

| Table | RLS | Policy | Predicate |
| --- | --- | --- | --- |
| `tenants` | Enabled + forced | `tenant_self_visibility` | `id = current_tenant_id()` |
| `tenant_themes` | Enabled + forced | `tenant_isolation` | `tenant_id = current_tenant_id()` (USING + WITH CHECK) |
| `tenant_custom_domains` | Enabled + forced | `tenant_isolation` | same |
| `users` | Enabled + forced | `tenant_isolation` | same |
| `merchants` | Enabled + forced | `tenant_isolation` | same |
| `merchant_operating_hours` | Enabled + forced | `tenant_isolation` | same |
| `categories` | Enabled + forced | `tenant_isolation` | same |
| `products` | Enabled + forced | `tenant_isolation` | same |
| `product_modifier_groups` | Enabled + forced | `tenant_isolation` | same |
| `product_modifiers` | Enabled + forced | `tenant_isolation` | same |
| `orders` | Enabled + forced | `tenant_isolation` | same |
| `order_items` | Enabled + forced | `tenant_isolation` | same |
| `order_item_modifiers` | Enabled + forced | `tenant_isolation` | same |

Policies use `current_tenant_id()` reading `app.current_tenant`. If unset, function returns `NULL`, predicate evaluates unknown, RLS fails closed.

---

## 9. Utility Functions and Triggers

Unchanged from prior version except updated FSM transition list.

| Function | Purpose |
| --- | --- |
| `set_updated_at()` | Sets `NEW.updated_at := now()` on `BEFORE UPDATE`. |
| `current_tenant_id()` (STABLE) | Reads `app.current_tenant` GUC. `NULL` when unset. |
| `enforce_order_status_transition()` | Rejects illegal FSM edges on `BEFORE UPDATE OF status`. Raises SQLSTATE `23514`. |

Applied triggers:

- `trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()` on every mutable table.
- `trg_orders_status_fsm BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition()`.

---

## 10. Operational Roles

| Role | `BYPASSRLS` | Grants | Used by |
| --- | --- | --- | --- |
| `app_runtime` | No | `SELECT, INSERT, UPDATE, DELETE` on all tables; `USAGE` on all sequences | Every request path |
| `platform_admin` | Yes | Same or broader | Tenant provisioning + cross-tenant admin only |

Per-request pattern:
```sql
BEGIN;
  SET LOCAL app.current_tenant = '<tenant-uuid-from-jwt-or-host>';
  -- queries here
COMMIT;
```

---

## 11. Breaking Changes to `schema.sql`

Before the next migration ships, `backend-server/src/database/schema.sql` must be updated to match this document. Specifically:

1. `products.price_amount numeric(12,2)` → `products.price_amount_cents bigint`
2. `orders.subtotal_amount / delivery_fee / tax_amount / total_amount` → `subtotal_cents / delivery_fee_cents / tax_cents / total_cents` (all `bigint`); add `discount_cents bigint`
3. `order_items.unit_price / line_total` → `unit_price_cents / line_total_cents` (all `bigint`)
4. Add `orders.fulfillment_type`, `orders.customer_full_name`, `orders.customer_contact_email`, `orders.customer_contact_phone`
5. Change `orders.customer_id` from `NOT NULL` to nullable
6. New tables: `tenant_themes`, `tenant_custom_domains`, `merchant_operating_hours`, `product_modifier_groups`, `product_modifiers`, `order_item_modifiers`
7. New enum types: `order_fulfillment_type`, `modifier_selection_type`, `custom_domain_status`
8. Add `MERCHANT_STAFF` value to `user_role` enum
9. Add `tenants.default_currency_code`, `tenants.default_locale`, `tenants.timezone`, `tenants.contact_email`
