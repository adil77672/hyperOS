import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * Two connection pools, per MASTER_CONTEXT §3.3.
 *
 * `app_runtime`  — NOBYPASSRLS. Every request handler. RLS applies, so a
 *                  missing `SET LOCAL app.current_tenant` returns zero rows
 *                  rather than the whole table.
 * `platform_admin` — BYPASSRLS. Two callers only:
 *                  1. tenant resolution by Host, which must read `tenants`
 *                     before any tenant context exists;
 *                  2. signup, which creates the tenant row itself.
 *                  Nothing else may take this pool.
 */

export interface DbCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export function buildDataSourceOptions(
  creds: DbCredentials,
  poolSize: number,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: creds.host,
    port: creds.port,
    database: creds.database,
    username: creds.username,
    password: creds.password,
    ssl: creds.ssl ? { rejectUnauthorized: false } : false,
    entities: ALL_ENTITIES,
    // schema.sql is authoritative. Never let TypeORM touch the DDL.
    synchronize: false,
    migrationsRun: false,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    extra: { max: poolSize },
  };
}

export function createAppDataSource(creds: DbCredentials): DataSource {
  return new DataSource(buildDataSourceOptions(creds, 20));
}

/** Small pool on purpose — this connection bypasses RLS. */
export function createPlatformDataSource(creds: DbCredentials): DataSource {
  return new DataSource(buildDataSourceOptions(creds, 4));
}
