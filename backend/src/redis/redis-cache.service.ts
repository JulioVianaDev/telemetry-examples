import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_TOKENS } from './tokens/redis-tokens';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  constructor(
    @Inject(REDIS_TOKENS.REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  onModuleInit() {
    this.redisClient.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  /**
   * Save data to cache with expiration time
   * @param key - Cache key
   * @param data - Data to cache
   * @param time - Expiration time in seconds
   * @returns Promise<void>
   * Time Complexity: O(1)
   */
  async saveData<T>({
    data,
    key,
    time,
  }: {
    data: T;
    key: string;
    time: number;
  }): Promise<void> {
    try {
      await this.redisClient.set(
        key,
        JSON.stringify(data),
        'EX',
        time,
      );
    } catch (error) {
      this.logger.error(`Error saving data to cache with key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get data from cache
   * @param key - Cache key
   * @returns Promise<T | null> - Returns parsed data or null if not found
   * Time Complexity: O(1)
   */
  async getData<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redisClient.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.error(`Error getting data from cache with key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete data from cache by key
   * @param key - Cache key to delete
   * @returns Promise<void>
   * Time Complexity: O(1)
   */
  async deleteData(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.error(`Error deleting data from cache with key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete all data matching a prefix
   * @param prefix - Key prefix to match
   * @returns Promise<void>
   * Note: Use with caution in production as KEYS can be slow
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.redisClient.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Error deleting data by prefix ${prefix}:`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key - Cache key
   * @returns Promise<boolean>
   * Time Complexity: O(1)
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redisClient.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL (Time To Live) of a key
   * @param key - Cache key
   * @returns Promise<number> - Returns TTL in seconds, -1 if no expiration, -2 if key doesn't exist
   * Time Complexity: O(1)
   */
  async getTTL(key: string): Promise<number> {
    try {
      return await this.redisClient.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      return -2;
    }
  }

  /**
   * Set expiration time for an existing key
   * @param key - Cache key
   * @param seconds - Expiration time in seconds
   * @returns Promise<boolean> - Returns true if expiration was set
   * Time Complexity: O(1)
   */
  async setExpiration(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redisClient.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get raw Redis client for advanced operations
   * @returns Redis client instance
   */
  getClient(): Redis {
    return this.redisClient;
  }
}

