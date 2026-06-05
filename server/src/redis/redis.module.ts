import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Provider factory: spin up a single ioredis client from REDIS_URL.
 * The factory pattern (vs. new Redis() in a service) lets tests override
 * the client via Test.createTestingModule({ providers: [{ provide: REDIS_CLIENT, useValue: mockClient }] }).
 */
const redisProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is required');
    }
    const client = new Redis(url, {
      // Don't crash the app on transient connect failures (e.g. local dev
      // starting before docker). Log + retry, the next request will reconnect.
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      // Surface connection issues in dev; production uses pino so this stays terse.
      // eslint-disable-next-line no-console
      console.error('[redis] connection error:', err.message);
    });
    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
