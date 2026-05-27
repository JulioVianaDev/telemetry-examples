import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { redisProviders } from './redis.providers';
import { REDIS_TOKENS } from './tokens/redis-tokens';

/**
 * Global Redis Cache Module
 * 
 * Provides Redis caching service for the entire application.
 * 
 * Usage in services:
 * @example
 * ```typescript
 * import { REDIS_TOKENS } from '@infra/redis/tokens/redis-tokens';
 * 
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     @Inject(REDIS_TOKENS.REDIS_CACHE_SERVICE)
 *     private readonly redisCacheService: RedisCacheService,
 *   ) {}
 * 
 *   async getData() {
 *     // Try to get from cache
 *     const cached = await this.redisCacheService.getData('my-key');
 *     if (cached) return cached;
 * 
 *     // Get from database
 *     const data = await this.repository.find();
 * 
 *     // Save to cache
 *     await this.redisCacheService.saveData({
 *       key: 'my-key',
 *       data,
 *       time: 3600, // 1 hour
 *     });
 * 
 *     return data;
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [...redisProviders],
  exports: [
    REDIS_TOKENS.REDIS_CLIENT,
    REDIS_TOKENS.REDIS_CACHE_SERVICE,
    ...Object.values(REDIS_TOKENS),
  ],
})
export class RedisCacheModule {}
