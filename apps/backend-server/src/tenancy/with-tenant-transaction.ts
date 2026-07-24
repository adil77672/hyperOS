import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';

/**
 * Runs `fn` in a short RLS-scoped transaction, outside the per-request one.
 *
 * Needed by routes that opt out of RlsTransactionInterceptor but still have a
 * bounded DB question to ask — the SSE endpoint authorising a merchant before
 * it starts streaming, for instance. The transaction closes before the long
 * -lived work begins, so no pool connection is pinned for the stream's life.
 *
 * Restores whatever manager was previously in context, so nesting inside a
 * request transaction is safe (the outer manager comes back afterwards).
 */
export async function withTenantTransaction<T>(
  dataSource: DataSource,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = TenantContext.get()?.manager;
  const runner = dataSource.createQueryRunner();

  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    TenantContext.patch({ manager: runner.manager });
    const result = await fn();
    await runner.commitTransaction();
    return result;
  } catch (err) {
    await runner.rollbackTransaction().catch(() => undefined);
    throw err;
  } finally {
    TenantContext.patch({ manager: previous });
    await runner.release();
  }
}
