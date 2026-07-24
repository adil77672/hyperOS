/**
 * Applies schema.sql to the database.
 *
 * Runs as the superuser, not app_runtime: the DDL creates extensions and the
 * app_runtime / platform_admin roles themselves, which an unprivileged role
 * cannot do. schema.sql is idempotent, so re-running it is safe.
 *
 *   npm run db:schema   (from apps/backend-server, with .env present)
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const host = process.env.DATABASE_HOST ?? 'localhost';
  const port = Number(process.env.DATABASE_PORT ?? 5432);
  const database = process.env.DATABASE_NAME ?? 'hyperzod';
  const user = process.env.DATABASE_SUPERUSER ?? 'postgres';
  const password = process.env.DATABASE_SUPERUSER_PASSWORD ?? 'postgres';
  const ssl = (process.env.DATABASE_SSL ?? 'false') === 'true';

  const sqlPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({
    host,
    port,
    database,
    user,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  // eslint-disable-next-line no-console
  console.log(`Applying schema to postgres://${user}@${host}:${port}/${database} ...`);

  await client.connect();
  try {
    // The whole file is one script with its own BEGIN/COMMIT; a single query()
    // runs it as one unit.
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log('Schema applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const detail =
    err?.code === 'ECONNREFUSED'
      ? `cannot reach Postgres at ${process.env.DATABASE_HOST ?? 'localhost'}:${
          process.env.DATABASE_PORT ?? 5432
        } (ECONNREFUSED). Is Postgres running?`
      : (err?.message || String(err));
  // eslint-disable-next-line no-console
  console.error('Schema application failed:', detail);
  process.exit(1);
});
