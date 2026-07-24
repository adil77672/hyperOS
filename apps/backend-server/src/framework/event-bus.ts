import { EventEmitter } from 'node:events';

/**
 * Process-local domain event bus (replaces @nestjs/event-emitter).
 *
 * A thin typed wrapper over Node's EventEmitter. Listeners are async and may
 * reject; the bus swallows rejections so one failing subscriber (a webhook, an
 * SSE publish) never takes down the request that emitted the event. Emission
 * is fire-and-forget by design — the emitter has already committed its work.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Order feeds can have many concurrent SSE subscribers per process.
    this.emitter.setMaxListeners(0);
  }

  on(event: string, listener: (payload: unknown) => void | Promise<void>): void {
    this.emitter.on(event, (payload: unknown) => {
      try {
        const result = listener(payload);
        if (result instanceof Promise) {
          result.catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`[event-bus] listener for "${event}" rejected:`, err);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[event-bus] listener for "${event}" threw:`, err);
      }
    });
  }

  emit(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
  }
}
