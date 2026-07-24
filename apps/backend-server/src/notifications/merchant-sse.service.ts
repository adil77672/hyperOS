import type Redis from 'ioredis';
import { monotonicFactory } from 'ulid';
import {
  OrderCreatedEventData,
  OrderStatusChangedEventData,
  SSE_EVENT_ORDER_CREATED,
  SSE_EVENT_ORDER_STATUS_CHANGED,
  SseEnvelope,
} from '@hyperzod/shared-types';
import { Logger } from '../common/logger';
import { EventBus } from '../framework/event-bus';
import { RedisKeys } from '../redis/redis-keys';
import { RedisService } from '../redis/redis.service';
import {
  ORDER_CREATED,
  ORDER_STATUS_CHANGED,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
} from '../orders/order.events';

export type SseListener = (frame: SseEnvelope) => void;

/**
 * SSE fan-out (MASTER_CONTEXT §7.1).
 *
 * Publish path:  domain event -> Redis PUBLISH + bounded buffer LIST
 * Delivery path: every process subscribes to the channels its own connected
 *                clients care about, and pushes to those local listeners.
 *
 * One shared subscriber connection per process, not one per client: a Redis
 * connection in subscriber mode is a whole TCP connection, and a busy merchant
 * with ten open dashboard tabs should not cost ten of them.
 */
export class MerchantSseService {
  private readonly logger = new Logger('MerchantSseService');
  private readonly nextUlid = monotonicFactory();
  private readonly listeners = new Map<string, Set<SseListener>>();
  private subscriber: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly eventBus: EventBus,
    private readonly bufferMax: number,
  ) {}

  /**
   * Wires up the Redis subscriber connection and the domain-event listeners.
   * Called once by the composition root at startup (replaces onModuleInit +
   * the @OnEvent decorators).
   */
  init(): void {
    this.eventBus.on(ORDER_CREATED, (e) => this.onOrderCreated(e as OrderCreatedEvent));
    this.eventBus.on(ORDER_STATUS_CHANGED, (e) =>
      this.onOrderStatusChanged(e as OrderStatusChangedEvent),
    );

    this.subscriber = this.redis.createConnection('sse-subscriber');
    this.subscriber.on('message', (channel: string, raw: string) => {
      const local = this.listeners.get(channel);
      if (!local?.size) return;

      let frame: SseEnvelope;
      try {
        frame = JSON.parse(raw) as SseEnvelope;
      } catch {
        this.logger.warn(`dropped malformed SSE payload on ${channel}`);
        return;
      }

      for (const listener of local) {
        try {
          listener(frame);
        } catch (err) {
          this.logger.warn(`SSE listener threw: ${(err as Error).message}`);
        }
      }
    });
  }

  /* ------------------------------------------------------------ publish */

  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const data: OrderCreatedEventData = {
      order_id: event.payload.orderId,
      order_number: event.payload.orderNumber,
      status: event.payload.status,
      fulfillment_type: event.payload.fulfillmentType,
      total_cents: event.payload.totalCents,
      currency_code: event.payload.currencyCode,
      placed_at: event.payload.placedAt.toISOString(),
      customer_full_name: event.payload.customerFullName,
      item_count: event.payload.itemCount,
    };
    await this.publish(event.tenantId, event.merchantId, SSE_EVENT_ORDER_CREATED, data);
  }

  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    const data: OrderStatusChangedEventData = {
      order_id: event.payload.orderId,
      order_number: event.payload.orderNumber,
      previous_status: event.payload.previousStatus,
      new_status: event.payload.newStatus,
      changed_at: event.payload.changedAt.toISOString(),
    };
    await this.publish(event.tenantId, event.merchantId, SSE_EVENT_ORDER_STATUS_CHANGED, data);
  }

  private async publish(
    tenantId: string,
    merchantId: string,
    eventName: string,
    data: unknown,
  ): Promise<void> {
    const frame: SseEnvelope = { id: this.nextUlid(), event: eventName, data };
    const serialized = JSON.stringify(frame);

    const channel = RedisKeys.sseChannel(tenantId, merchantId);
    const buffer = RedisKeys.sseBuffer(tenantId, merchantId);

    try {
      // Buffer first, then publish. A client that reconnects immediately after
      // the publish must find the event already replayable; the reverse order
      // leaves a window where it is neither live nor buffered.
      await this.redis.client
        .multi()
        .rpush(buffer, serialized)
        .ltrim(buffer, -this.bufferMax, -1)
        .expire(buffer, 86_400)
        .publish(channel, serialized)
        .exec();
    } catch (err) {
      // A failed publish must not fail the order that caused it. The dashboard
      // still polls, and reconnect replay covers the gap.
      this.logger.error(`SSE publish failed for ${channel}: ${(err as Error).message}`);
    }
  }

  /* ---------------------------------------------------------- subscribe */

  async subscribe(
    tenantId: string,
    merchantId: string,
    listener: SseListener,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeys.sseChannel(tenantId, merchantId);

    let bucket = this.listeners.get(channel);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(channel, bucket);
      await this.subscriber.subscribe(channel);
    }
    bucket.add(listener);

    return async () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(channel);
        await this.subscriber.unsubscribe(channel).catch(() => undefined);
      }
    };
  }

  /**
   * Reconnect replay (API_AND_EVENT_CONTRACTS §5.5).
   *
   * Returns the events newer than `lastEventId`, or `gap: true` when that id
   * has already fallen off the bounded buffer — the dashboard then refetches
   * active orders over REST instead of silently missing them.
   */
  async replay(
    tenantId: string,
    merchantId: string,
    lastEventId: string | undefined,
  ): Promise<{ frames: SseEnvelope[]; gap: boolean }> {
    if (!lastEventId) return { frames: [], gap: false };

    const raw = await this.redis.client.lrange(
      RedisKeys.sseBuffer(tenantId, merchantId),
      0,
      -1,
    );

    const frames: SseEnvelope[] = [];
    for (const entry of raw) {
      try {
        frames.push(JSON.parse(entry) as SseEnvelope);
      } catch {
        // Skip a corrupt entry rather than abandon the whole replay.
      }
    }

    if (frames.length === 0) {
      // Nothing buffered. Either nothing has happened since, or the buffer
      // expired. We cannot tell the two apart, so we declare a gap and let
      // the client refetch — a needless refetch beats a missed order.
      return { frames: [], gap: true };
    }

    // ULIDs are lexicographically sortable, which is the whole reason for
    // using them as event ids here.
    if (lastEventId < frames[0]!.id) {
      return { frames: [], gap: true };
    }

    return { frames: frames.filter((f) => f.id > lastEventId), gap: false };
  }
}
