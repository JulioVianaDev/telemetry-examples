/**
 * Redis Injection Tokens
 * Use these symbols for type-safe dependency injection
 */
export const REDIS_TOKENS = {
  REDIS_CLIENT: Symbol('REDIS_CLIENT'),
  REDIS_CACHE_SERVICE: Symbol('REDIS_CACHE_SERVICE'),
} as const;

export type RedisTokens =
  (typeof REDIS_TOKENS)[keyof typeof REDIS_TOKENS];

