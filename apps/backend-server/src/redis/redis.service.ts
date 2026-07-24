import Redis, { RedisOptions } from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * One shared command client, plus on-demand dedicated connections for pub/sub.
 *
 * A Redis connection in subscriber mode cannot issue ordinary commands, so the
 * SSE fan-out needs its own connection rather than sharing this one.
 */
export class RedisService {
  private readonly options: RedisOptions;
  private readonly extraClients: Redis[] = [];

  readonly client: Redis;

  constructor(config: RedisConfig) {
    this.options = {
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      db: config.db,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    };

    this.client = new Redis(this.options);
    this.client.on('error', (err) => console.error(`redis error: ${err.message}`));
  }

  /** A dedicated connection (e.g. a pub/sub subscriber). Closed on shutdown. */
  createConnection(label: string): Redis {
    const conn = new Redis(this.options);
    conn.on('error', (err) => console.error(`redis[${label}] error: ${err.message}`));
    this.extraClients.push(conn);
    return conn;
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.client.quit(),
      ...this.extraClients.map((c) => c.quit()),
    ]);
  }
}
