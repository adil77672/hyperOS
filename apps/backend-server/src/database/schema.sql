-- ===========================================================================
-- Hyperzod platform — authoritative schema
-- ===========================================================================
--
-- SYSTEM_DATA_DICTIONARY.md preamble: "If this document and schema.sql
-- disagree, schema.sql is authoritative. If code and schema.sql disagree,
-- schema.sql is still authoritative. Nothing is authoritative over schema.sql."
--
-- This file implements every item in SYSTEM_DATA_DICTIONARY.md §11 (Breaking
-- Changes): integer-cents money, the new modifier/theme/hours tables, the new
-- enum types, and the widened `user_role`.
--
-- Idempotent: safe to re-run against an existing database.
-- Run as a superuser (role creation + extensions require it).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extensions (dictionary §2.1)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email / slug
CREATE EXTENSION IF NOT EXISTS postgis;    -- merchant point, delivery zones

-- ---------------------------------------------------------------------------
-- 2. Enum types (dictionary §2.2)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_status') THEN
    CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'SUPER_ADMIN', 'TENANT_ADMIN', 'MERCHANT_OWNER',
      'MERCHANT_STAFF', 'DRIVER', 'CUSTOMER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_status') THEN
    CREATE TYPE merchant_status AS ENUM (
      'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
    CREATE TYPE product_status AS ENUM ('ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'PENDING', 'MERCHANT_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_fulfillment_type') THEN
    CREATE TYPE order_fulfillment_type AS ENUM ('PICKUP', 'DELIVERY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modifier_selection_type') THEN
    CREATE TYPE modifier_selection_type AS ENUM ('SINGLE', 'MULTIPLE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custom_domain_status') THEN
    CREATE TYPE custom_domain_status AS ENUM (
      'PENDING_VERIFICATION', 'VERIFIED', 'SSL_ISSUED', 'ACTIVE', 'FAILED'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Utility functions (dictionary §9)
-- ---------------------------------------------------------------------------

-- Reads the per-transaction GUC set by the RLS transaction interceptor.
-- STABLE, not IMMUTABLE: the value is constant within a statement but varies
-- between transactions. Returns NULL when unset so RLS fails closed.
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.current_tenant', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tenant layer (dictionary §3)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenants (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text          NOT NULL,
  slug                  citext        NOT NULL,
  status                tenant_status NOT NULL DEFAULT 'ACTIVE',
  default_currency_code char(3)       NOT NULL DEFAULT 'AUD',
  default_locale        text          NOT NULL DEFAULT 'en-AU',
  timezone              text          NOT NULL DEFAULT 'Australia/Sydney',
  contact_email         citext        NOT NULL,
  metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT tenants_slug_key UNIQUE (slug),
  CONSTRAINT tenants_slug_format_chk
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'),
  CONSTRAINT tenants_currency_chk
    CHECK (default_currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

CREATE TABLE IF NOT EXISTS tenant_themes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  logo_url       text,
  favicon_url    text,
  hero_image_url text,
  about_text     text,
  colors         jsonb       NOT NULL DEFAULT
    '{"primary":"#0F5132","secondary":"#D4A017","accent":"#B23A48",
      "background":"#FFFFFF","foreground":"#101828","muted":"#F2F4F7",
      "border":"#EAECF0","danger":"#B42318","success":"#027A48"}'::jsonb,
  typography     jsonb       NOT NULL DEFAULT
    '{"heading_font_family":"Inter, system-ui, sans-serif",
      "body_font_family":"Inter, system-ui, sans-serif",
      "base_font_size_px":16,"heading_weight":600,"body_weight":400}'::jsonb,
  layout         jsonb       NOT NULL DEFAULT
    '{"border_radius_px": 8, "container_max_width_px": 1200}'::jsonb,
  hero           jsonb       NOT NULL DEFAULT
    '{"style": "IMAGE_WITH_OVERLAY", "overlay_opacity": 0.3}'::jsonb,
  social_links   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  legal_pages    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_themes_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT tenant_themes_tenant_key UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS tenant_custom_domains (
  id                 uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid                 NOT NULL,
  hostname           citext               NOT NULL,
  status             custom_domain_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  verification_token text                 NOT NULL,
  verified_at        timestamptz,
  ssl_issued_at      timestamptz,
  last_check_at      timestamptz,
  created_at         timestamptz          NOT NULL DEFAULT now(),
  updated_at         timestamptz          NOT NULL DEFAULT now(),

  CONSTRAINT tenant_custom_domains_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT tenant_custom_domains_hostname_key UNIQUE (hostname)
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_domains_tenant
  ON tenant_custom_domains (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 5. Identity layer (dictionary §4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  email             citext      NOT NULL,
  phone             text,
  password_hash     text,
  full_name         text        NOT NULL,
  role              user_role   NOT NULL DEFAULT 'CUSTOMER',
  is_active         boolean     NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT users_tenant_email_key UNIQUE (tenant_id, email),
  CONSTRAINT users_tenant_id_uq     UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_role
  ON users (tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_users_active_drivers
  ON users (tenant_id) WHERE role = 'DRIVER' AND is_active;

-- ---------------------------------------------------------------------------
-- 6. Catalog layer (dictionary §5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merchants (
  id               uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid                        NOT NULL,
  owner_user_id    uuid                        NOT NULL,
  name             text                        NOT NULL,
  slug             citext                      NOT NULL,
  description      text,
  status           merchant_status             NOT NULL DEFAULT 'PENDING_APPROVAL',
  contact_phone    text,
  accepting_orders boolean                     NOT NULL DEFAULT true,
  avg_prep_minutes integer                     NOT NULL DEFAULT 20,
  location         geometry(Point, 4326),
  delivery_zone    geometry(MultiPolygon, 4326),
  created_at       timestamptz                 NOT NULL DEFAULT now(),
  updated_at       timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT merchants_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT merchants_owner_fk
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT merchants_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT merchants_tenant_id_uq    UNIQUE (tenant_id, id),
  CONSTRAINT merchants_delivery_zone_valid_chk
    CHECK (delivery_zone IS NULL OR ST_IsValid(delivery_zone)),
  CONSTRAINT merchants_prep_chk CHECK (avg_prep_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_merchants_tenant_status
  ON merchants (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_merchants_owner
  ON merchants (tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_location_gist
  ON merchants USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_merchants_zone_gist
  ON merchants USING GIST (delivery_zone);

CREATE TABLE IF NOT EXISTS merchant_operating_hours (
  id          uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid     NOT NULL,
  merchant_id uuid     NOT NULL,
  day_of_week smallint NOT NULL,
  opens_at    time     NOT NULL,
  closes_at   time     NOT NULL,

  CONSTRAINT moh_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT moh_merchant_fk
    FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT moh_day_chk CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT moh_merchant_day_key
    UNIQUE (tenant_id, merchant_id, day_of_week, opens_at)
);

CREATE INDEX IF NOT EXISTS idx_moh_merchant
  ON merchant_operating_hours (tenant_id, merchant_id, day_of_week);

CREATE TABLE IF NOT EXISTS categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  merchant_id uuid        NOT NULL,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT categories_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT categories_merchant_fk
    FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT categories_tenant_merchant_name_key
    UNIQUE (tenant_id, merchant_id, name),
  CONSTRAINT categories_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_categories_merchant
  ON categories (tenant_id, merchant_id, sort_order);

CREATE TABLE IF NOT EXISTS products (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid           NOT NULL,
  merchant_id        uuid           NOT NULL,
  category_id        uuid,
  name               text           NOT NULL,
  description        text,
  price_amount_cents bigint         NOT NULL,
  currency_code      char(3)        NOT NULL,
  status             product_status NOT NULL DEFAULT 'ACTIVE',
  image_url          text,
  sort_order         integer        NOT NULL DEFAULT 0,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT products_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT products_merchant_fk
    FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants (tenant_id, id)
    ON DELETE CASCADE,
  -- The column list is load-bearing. A bare ON DELETE SET NULL on a composite
  -- FK nulls EVERY referencing column, including tenant_id, which is NOT NULL
  -- — so deleting a category would fail outright. Naming the column confines
  -- the SET NULL to category_id. Requires PostgreSQL 15+.
  CONSTRAINT products_category_fk
    FOREIGN KEY (tenant_id, category_id) REFERENCES categories (tenant_id, id)
    ON DELETE SET NULL (category_id),
  CONSTRAINT products_price_chk    CHECK (price_amount_cents >= 0),
  CONSTRAINT products_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT products_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_products_merchant
  ON products (tenant_id, merchant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (tenant_id, merchant_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  id             uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid                    NOT NULL,
  product_id     uuid                    NOT NULL,
  name           text                    NOT NULL,
  selection_type modifier_selection_type NOT NULL,
  is_required    boolean                 NOT NULL DEFAULT false,
  min_selections integer                 NOT NULL DEFAULT 0,
  max_selections integer                 NOT NULL DEFAULT 1,
  sort_order     integer                 NOT NULL DEFAULT 0,
  created_at     timestamptz             NOT NULL DEFAULT now(),
  updated_at     timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT pmg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT pmg_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT pmg_min_chk CHECK (min_selections >= 0),
  CONSTRAINT pmg_max_chk CHECK (max_selections >= min_selections),
  CONSTRAINT pmg_single_chk CHECK (
    selection_type = 'MULTIPLE'
    OR (min_selections IN (0, 1) AND max_selections = 1)
  ),
  CONSTRAINT pmg_required_chk CHECK (NOT is_required OR min_selections >= 1),
  CONSTRAINT pmg_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pmg_product
  ON product_modifier_groups (tenant_id, product_id, sort_order);

CREATE TABLE IF NOT EXISTS product_modifiers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  group_id          uuid        NOT NULL,
  name              text        NOT NULL,
  -- Signed on purpose: "Small: -5000" is a legitimate size discount.
  delta_price_cents bigint      NOT NULL DEFAULT 0,
  is_default        boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pm_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT pm_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES product_modifier_groups (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT pm_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pm_group
  ON product_modifiers (tenant_id, group_id, sort_order);

-- ---------------------------------------------------------------------------
-- 7. Order layer (dictionary §6)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id                     uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid                   NOT NULL,
  merchant_id            uuid                   NOT NULL,
  customer_id            uuid,
  driver_id              uuid,
  order_number           text                   NOT NULL,
  status                 order_status           NOT NULL DEFAULT 'PENDING',
  fulfillment_type       order_fulfillment_type NOT NULL,
  subtotal_cents         bigint                 NOT NULL DEFAULT 0,
  delivery_fee_cents     bigint                 NOT NULL DEFAULT 0,
  tax_cents              bigint                 NOT NULL DEFAULT 0,
  discount_cents         bigint                 NOT NULL DEFAULT 0,
  total_cents            bigint                 NOT NULL DEFAULT 0,
  currency_code          char(3)                NOT NULL DEFAULT 'USD',
  customer_full_name     text                   NOT NULL,
  customer_contact_email citext                 NOT NULL,
  customer_contact_phone text                   NOT NULL,
  delivery_address       text,
  delivery_location      geometry(Point, 4326),
  notes                  text,
  placed_at              timestamptz            NOT NULL DEFAULT now(),
  accepted_at            timestamptz,
  ready_at               timestamptz,
  dispatched_at          timestamptz,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  cancellation_reason    text,
  created_at             timestamptz            NOT NULL DEFAULT now(),
  updated_at             timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT orders_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT orders_merchant_fk
    FOREIGN KEY (tenant_id, merchant_id) REFERENCES merchants (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES users (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT orders_driver_fk
    FOREIGN KEY (tenant_id, driver_id) REFERENCES users (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT orders_tenant_number_key UNIQUE (tenant_id, order_number),
  CONSTRAINT orders_tenant_id_uq      UNIQUE (tenant_id, id),
  CONSTRAINT orders_totals_chk CHECK (
    subtotal_cents     >= 0 AND
    delivery_fee_cents >= 0 AND
    tax_cents          >= 0 AND
    discount_cents     >= 0 AND
    total_cents        >= 0
  ),
  CONSTRAINT orders_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  -- Dictionary §6.1 marks this app-layer; it is cheap to make structural.
  CONSTRAINT orders_delivery_address_chk CHECK (
    fulfillment_type <> 'DELIVERY' OR delivery_address IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant
  ON orders (tenant_id, merchant_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON orders (tenant_id, customer_id, placed_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_driver
  ON orders (tenant_id, driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_status
  ON orders (tenant_id, status)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED', 'DELIVERY_FAILED');
CREATE INDEX IF NOT EXISTS idx_orders_delivery_location_gist
  ON orders USING GIST (delivery_location);

CREATE TABLE IF NOT EXISTS order_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  order_id         uuid        NOT NULL,
  product_id       uuid,
  product_name     text        NOT NULL,
  unit_price_cents bigint      NOT NULL,
  quantity         integer     NOT NULL,
  line_total_cents bigint      NOT NULL,
  notes            text,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT oi_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT oi_order_fk
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)
    ON DELETE CASCADE,
  -- See products_category_fk: the column list keeps tenant_id intact.
  CONSTRAINT oi_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
    ON DELETE SET NULL (product_id),
  CONSTRAINT oi_qty_chk   CHECK (quantity > 0),
  CONSTRAINT oi_price_chk CHECK (unit_price_cents >= 0 AND line_total_cents >= 0),
  CONSTRAINT oi_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_oi_order   ON order_items (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_oi_product ON order_items (tenant_id, product_id);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  order_item_id     uuid        NOT NULL,
  modifier_id       uuid,
  group_name        text        NOT NULL,
  modifier_name     text        NOT NULL,
  delta_price_cents bigint      NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT oim_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT oim_order_item_fk
    FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT oim_modifier_fk
    FOREIGN KEY (tenant_id, modifier_id) REFERENCES product_modifiers (tenant_id, id)
    ON DELETE SET NULL (modifier_id)
);

CREATE INDEX IF NOT EXISTS idx_oim_order_item
  ON order_item_modifiers (tenant_id, order_item_id);

-- ---------------------------------------------------------------------------
-- 8. Order number allocation
-- ---------------------------------------------------------------------------
--
-- API_AND_EVENT_CONTRACTS.md §4.3 step 5 marks the format as an assumption:
-- "monotonic per-merchant, zero-padded, e.g. ORD-20260723-00042".
-- A counter row per (tenant, merchant, local date) gives that monotonicity
-- without a full-table COUNT and without a race — the UPSERT is atomic.

CREATE TABLE IF NOT EXISTS order_number_counters (
  tenant_id    uuid   NOT NULL,
  merchant_id  uuid   NOT NULL,
  business_day date   NOT NULL,
  counter      bigint NOT NULL DEFAULT 0,

  CONSTRAINT onc_pk PRIMARY KEY (tenant_id, merchant_id, business_day),
  CONSTRAINT onc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Allocates and returns the next sequence number for the given business day.
CREATE OR REPLACE FUNCTION next_order_sequence(
  p_tenant_id   uuid,
  p_merchant_id uuid,
  p_day         date
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  next_value bigint;
BEGIN
  INSERT INTO order_number_counters (tenant_id, merchant_id, business_day, counter)
  VALUES (p_tenant_id, p_merchant_id, p_day, 1)
  ON CONFLICT (tenant_id, merchant_id, business_day)
  DO UPDATE SET counter = order_number_counters.counter + 1
  RETURNING counter INTO next_value;

  RETURN next_value;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Order FSM trigger (MASTER_CONTEXT §8) — authoritative
-- ---------------------------------------------------------------------------
--
-- The OrdersService.ALLOWED_TRANSITIONS map in TypeScript is a mirror of this
-- function, never the other way round.
--
-- Deviation from MASTER_CONTEXT §8's table, deliberate and documented:
-- READY_FOR_PICKUP -> DELIVERED is permitted. PRODUCT_MAPPING §1.4 lists
-- "Mark delivered (self-delivery shortcut)" as a Phase 1 capability, and §8
-- itself says the practical v1 flow terminates at READY_FOR_PICKUP or
-- DELIVERED with no driver network in between. Without this edge that
-- capability is unreachable.

CREATE OR REPLACE FUNCTION enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed order_status[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'PENDING'           THEN ARRAY['MERCHANT_ACCEPTED', 'CANCELLED']::order_status[]
    WHEN 'MERCHANT_ACCEPTED' THEN ARRAY['PREPARING', 'CANCELLED']::order_status[]
    WHEN 'PREPARING'         THEN ARRAY['READY_FOR_PICKUP', 'CANCELLED']::order_status[]
    WHEN 'READY_FOR_PICKUP'  THEN ARRAY['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']::order_status[]
    WHEN 'OUT_FOR_DELIVERY'  THEN ARRAY['DELIVERED', 'DELIVERY_FAILED']::order_status[]
    ELSE ARRAY[]::order_status[]   -- DELIVERED / CANCELLED / DELIVERY_FAILED are terminal
  END;

  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION
      'Order cannot transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514',
            CONSTRAINT = 'orders_status_fsm_chk';
  END IF;

  IF NEW.status IN ('CANCELLED', 'DELIVERY_FAILED')
     AND (NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '') THEN
    RAISE EXCEPTION
      'Transition to % requires a cancellation_reason', NEW.status
      USING ERRCODE = '23514',
            CONSTRAINT = 'orders_cancellation_reason_chk';
  END IF;

  -- Lifecycle timestamps are owned here so they can never drift from status.
  CASE NEW.status
    WHEN 'MERCHANT_ACCEPTED' THEN NEW.accepted_at    := COALESCE(NEW.accepted_at, now());
    WHEN 'READY_FOR_PICKUP'  THEN NEW.ready_at       := COALESCE(NEW.ready_at, now());
    WHEN 'OUT_FOR_DELIVERY'  THEN NEW.dispatched_at  := COALESCE(NEW.dispatched_at, now());
    WHEN 'DELIVERED'         THEN NEW.delivered_at   := COALESCE(NEW.delivered_at, now());
    WHEN 'CANCELLED'         THEN NEW.cancelled_at   := COALESCE(NEW.cancelled_at, now());
    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Trigger wiring (dictionary §9)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  mutable_tables text[] := ARRAY[
    'tenants', 'tenant_themes', 'tenant_custom_domains', 'users', 'merchants',
    'categories', 'products', 'product_modifier_groups', 'product_modifiers',
    'orders'
  ];
BEGIN
  FOREACH t IN ARRAY mutable_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_status_fsm ON orders;
CREATE TRIGGER trg_orders_status_fsm
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- ---------------------------------------------------------------------------
-- 11. Row-level security (dictionary §8)
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self_visibility ON tenants;
CREATE POLICY tenant_self_visibility ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

DO $$
DECLARE
  t text;
  scoped_tables text[] := ARRAY[
    'tenant_themes', 'tenant_custom_domains', 'users', 'merchants',
    'merchant_operating_hours', 'categories', 'products',
    'product_modifier_groups', 'product_modifiers', 'orders', 'order_items',
    'order_item_modifiers', 'order_number_counters'
  ];
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_tenant_id())
         WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 12. Operational roles (dictionary §10, MASTER_CONTEXT §3.3)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime' NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_admin') THEN
    CREATE ROLE platform_admin LOGIN PASSWORD 'platform_admin' BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO app_runtime, platform_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO app_runtime, platform_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO app_runtime, platform_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime, platform_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime, platform_admin;

COMMIT;
