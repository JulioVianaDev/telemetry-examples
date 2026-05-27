import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { REDIS_TOKENS } from './tokens/redis-tokens';
import { RedisCacheService } from './redis-cache.service';

/**
 * Redis client factory
 * Creates a Redis client instance with configuration from environment variables
 */
export const redisClientFactory = (
  configService: ConfigService,
): Redis => {
  const host = configService.get<string>('REDIS_HOST', '127.0.0.1');
  const port = configService.get<number>('REDIS_PORT', 6379);
  const password = configService.get<string>('REDIS_PASSWORD');

  const options: RedisOptions = {
    host,
    port,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };

  if (password) {
    options.password = password;
  }

  const client = new Redis(options);

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  client.on('connect', () => {
    console.log(`Redis client connecting to ${host}:${port}`);
  });

  client.on('ready', () => {
    console.log('Redis client ready');
  });

  return client;
};

/**
 * Redis client provider
 */
export const redisClientProvider: Provider = {
  provide: REDIS_TOKENS.REDIS_CLIENT,
  useFactory: redisClientFactory,
  inject: [ConfigService],
};

/**
 * Redis cache service provider
 */
export const redisCacheServiceProvider: Provider = {
  provide: REDIS_TOKENS.REDIS_CACHE_SERVICE,
  useFactory: (redisClient: Redis) => {
    return new RedisCacheService(redisClient);
  },
  inject: [REDIS_TOKENS.REDIS_CLIENT],
};

/**
 * All Redis-related providers
 */
export const redisProviders: Provider[] = [
  redisClientProvider,
  redisCacheServiceProvider,
  RedisCacheService,
];

