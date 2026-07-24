/**
 * Seeds a demo tenant so the storefront and dashboard have something to show.
 *
 * Mirrors the worked example that runs through all four spec documents: "The
 * Cheesy One" (slug `cheesyone`), an owner login, and a Cappuccino carrying the
 * exact modifier groups from PRODUCT_MAPPING §3.3.
 *
 * Runs as platform_admin (BYPASSRLS) so it can insert across tenant-scoped
 * tables without a tenant context. Idempotent: it bails if the slug exists.
 *
 *   npm run db:seed   (from apps/backend-server, with .env present)
 */
import 'dotenv/config';
import { Client } from 'pg';
import { hashPassword } from '../auth/password';

const SLUG = 'cheesyone';
const OWNER_EMAIL = 'owner@cheesyone.com';
const OWNER_PASSWORD = 'cheesyone-dev-12345';

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'hyperzod',
    // Prefer platform_admin (BYPASSRLS); fall back to superuser for a fresh box.
    user: process.env.DATABASE_PLATFORM_USER ?? process.env.DATABASE_SUPERUSER ?? 'postgres',
    password:
      process.env.DATABASE_PLATFORM_PASSWORD ?? process.env.DATABASE_SUPERUSER_PASSWORD ?? 'postgres',
    ssl: (process.env.DATABASE_SSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', [SLUG]);
    if (existing.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Tenant "${SLUG}" already exists (${existing.rows[0].id}); nothing to do.`);
      return;
    }

    await client.query('BEGIN');

    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (name, slug, status, default_currency_code, default_locale, timezone, contact_email)
       VALUES ($1, $2, 'ACTIVE', 'AUD', 'en-AU', 'Australia/Sydney', $3)
       RETURNING id`,
      ['The Cheesy One', SLUG, OWNER_EMAIL],
    );
    const tenantId = tenantRows[0].id as string;

    await client.query(
      `INSERT INTO tenant_themes (tenant_id, about_text, hero)
       VALUES ($1, $2, $3::jsonb)`,
      [
        tenantId,
        'Family-owned since 2018.',
        JSON.stringify({
          style: 'IMAGE_WITH_OVERLAY',
          overlay_opacity: 0.35,
          heading_text: 'Freshly roasted, daily.',
          subheading_text: 'Order for pickup or delivery.',
        }),
      ],
    );

    const passwordHash = await hashPassword(OWNER_PASSWORD);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (tenant_id, email, phone, password_hash, full_name, role, is_active, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, 'TENANT_ADMIN', true, now())
       RETURNING id`,
      [tenantId, OWNER_EMAIL, '+61400000000', passwordHash, 'Oliver Portocarrero'],
    );
    const ownerId = userRows[0].id as string;

    const { rows: merchantRows } = await client.query(
      `INSERT INTO merchants
         (tenant_id, owner_user_id, name, slug, description, status, contact_phone,
          accepting_orders, avg_prep_minutes)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, true, 25)
       RETURNING id`,
      [
        tenantId,
        ownerId,
        'The Cheesy One — Newtown',
        SLUG,
        'Fresh, wood-fired pizzas since 2018.',
        '+61400000000',
      ],
    );
    const merchantId = merchantRows[0].id as string;

    const { rows: categoryRows } = await client.query(
      `INSERT INTO categories (tenant_id, merchant_id, name, sort_order, is_active)
       VALUES ($1, $2, 'Coffee', 1, true)
       RETURNING id`,
      [tenantId, merchantId],
    );
    const categoryId = categoryRows[0].id as string;

    const { rows: productRows } = await client.query(
      `INSERT INTO products
         (tenant_id, merchant_id, category_id, name, description, price_amount_cents,
          currency_code, status, sort_order)
       VALUES ($1, $2, $3, 'Cappuccino', $4, 40000, 'AUD', 'ACTIVE', 1)
       RETURNING id`,
      [tenantId, merchantId, categoryId, 'Classic cappuccino with silky microfoam.'],
    );
    const productId = productRows[0].id as string;

    // The three modifier groups, verbatim from PRODUCT_MAPPING §3.3.
    await seedModifierGroup(client, tenantId, productId, {
      name: 'Size',
      selectionType: 'SINGLE',
      isRequired: true,
      min: 1,
      max: 1,
      sort: 1,
      modifiers: [
        { name: 'Small', delta: -5000, default: false },
        { name: 'Regular', delta: 0, default: true },
        { name: 'Large', delta: 10000, default: false },
      ],
    });

    await seedModifierGroup(client, tenantId, productId, {
      name: 'Milk',
      selectionType: 'SINGLE',
      isRequired: true,
      min: 1,
      max: 1,
      sort: 2,
      modifiers: [
        { name: 'Whole', delta: 0, default: true },
        { name: 'Skim', delta: 0, default: false },
        { name: 'Oat', delta: 5000, default: false },
        { name: 'Almond', delta: 5000, default: false },
        { name: 'Soy', delta: 5000, default: false },
      ],
    });

    await seedModifierGroup(client, tenantId, productId, {
      name: 'Extras',
      selectionType: 'MULTIPLE',
      isRequired: false,
      min: 0,
      max: 3,
      sort: 3,
      modifiers: [
        { name: 'Extra espresso shot', delta: 7000, default: false },
        { name: 'Extra foam', delta: 0, default: false },
        { name: 'Vanilla syrup', delta: 3000, default: false },
        { name: 'Caramel syrup', delta: 3000, default: false },
      ],
    });

    await client.query('COMMIT');

    // eslint-disable-next-line no-console
    console.log(
      [
        'Seed complete.',
        `  tenant:    ${tenantId} (slug "${SLUG}")`,
        `  merchant:  ${merchantId}`,
        `  product:   ${productId} (Cappuccino)`,
        '',
        '  Dashboard login:',
        `    email:    ${OWNER_EMAIL}`,
        `    password: ${OWNER_PASSWORD}`,
        '',
        '  Try the storefront (dev fallback tenant is "cheesyone"):',
        '    curl http://localhost:3000/api/v1/storefront/bootstrap',
        '    curl http://localhost:3000/api/v1/storefront/menu',
      ].join('\n'),
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

interface GroupSeed {
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  min: number;
  max: number;
  sort: number;
  modifiers: { name: string; delta: number; default: boolean }[];
}

async function seedModifierGroup(
  client: Client,
  tenantId: string,
  productId: string,
  group: GroupSeed,
): Promise<void> {
  const { rows } = await client.query(
    `INSERT INTO product_modifier_groups
       (tenant_id, product_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tenantId,
      productId,
      group.name,
      group.selectionType,
      group.isRequired,
      group.min,
      group.max,
      group.sort,
    ],
  );
  const groupId = rows[0].id as string;

  for (const [index, modifier] of group.modifiers.entries()) {
    await client.query(
      `INSERT INTO product_modifiers
         (tenant_id, group_id, name, delta_price_cents, is_default, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [tenantId, groupId, modifier.name, modifier.delta, modifier.default, index + 1],
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', describeDbError(err));
  process.exit(1);
});

/**
 * A Postgres ECONNREFUSED surfaces as an AggregateError whose `.message` is the
 * empty string, which printed a useless "Seed failed:" with nothing after it.
 * Surface the real cause instead.
 */
function describeDbError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; errors?: unknown[] };
    if (e.code === 'ECONNREFUSED') {
      return `cannot reach Postgres at ${process.env.DATABASE_HOST ?? 'localhost'}:${
        process.env.DATABASE_PORT ?? 5432
      } (ECONNREFUSED). Is Postgres running?`;
    }
    if (e.message) return e.message;
    if (Array.isArray(e.errors) && e.errors.length) {
      return e.errors.map((x) => (x as Error).message).join('; ');
    }
  }
  return String(err);
}
