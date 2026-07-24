import { AsyncLocalStorage } from 'node:async_hooks';
import type { EntityManager } from 'typeorm';
import { UserRole } from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';

export type RequestMode = 'storefront' | 'dashboard';

export interface RequestContext {
  /** Undefined only on unauthenticated dashboard routes (login, signup). */
  tenantId?: string;
  tenantSlug?: string;
  mode: RequestMode;

  /** Storefront session id from the `hzsid` cookie. */
  sessionId?: string;

  /** Dashboard JWT subject. */
  userId?: string;
  role?: UserRole;

  /**
   * The transaction-scoped EntityManager installed by RlsTransactionInterceptor.
   * Every tenant-scoped query must go through this — a query issued on the raw
   * DataSource runs outside the transaction that set `app.current_tenant` and
   * will silently return nothing.
   */
  manager?: EntityManager;

  /**
   * Domain events raised during the request, held until the transaction
   * commits. Emitting inline would let a subscriber publish an order over SSE
   * that a REST read cannot see yet — or, worse, one whose transaction then
   * rolls back.
   */
  pendingEvents?: BufferedEvent[];

  requestId: string;
}

export interface BufferedEvent {
  name: string;
  event: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const TenantContext = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /** Throws rather than returning undefined — callers should not guess. */
  require(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw ApiException.internal(
        'No request context. A handler ran outside TenantResolutionMiddleware.',
      );
    }
    return ctx;
  },

  requireTenantId(): string {
    const { tenantId } = TenantContext.require();
    if (!tenantId) {
      throw ApiException.internal(
        'No tenant in request context. This route requires tenant resolution.',
      );
    }
    return tenantId;
  },

  /**
   * The RLS-bound EntityManager for the current request transaction.
   */
  requireManager(): EntityManager {
    const { manager } = TenantContext.require();
    if (!manager) {
      throw ApiException.internal(
        'No transactional EntityManager. Route is missing RlsTransactionInterceptor.',
      );
    }
    return manager;
  },

  patch(patch: Partial<RequestContext>): void {
    const ctx = storage.getStore();
    if (ctx) Object.assign(ctx, patch);
  },

  /** Queues a domain event for emission after the request transaction commits. */
  enqueueEvent(name: string, event: unknown): void {
    const ctx = storage.getStore();
    if (!ctx) {
      throw ApiException.internal(
        'Cannot enqueue a domain event outside a request context.',
      );
    }
    (ctx.pendingEvents ??= []).push({ name, event });
  },

  /** Returns and clears the buffer. Called only by RlsTransactionInterceptor. */
  drainEvents(): BufferedEvent[] {
    const ctx = storage.getStore();
    if (!ctx?.pendingEvents?.length) return [];
    const drained = ctx.pendingEvents;
    ctx.pendingEvents = [];
    return drained;
  },
};
