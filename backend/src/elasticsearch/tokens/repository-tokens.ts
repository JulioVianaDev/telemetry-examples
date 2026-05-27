/**
 * ElasticSearch Repository Injection Tokens
 * Use these symbols for type-safe dependency injection
 */
export const ELASTICSEARCH_REPOSITORY_TOKENS = {
  // Products
  PRODUCT_REPOSITORY: Symbol('PRODUCT_REPOSITORY'),

  // Logs
  LOG_REPOSITORY: Symbol('LOG_REPOSITORY'),

  // Files
  FILE_REPOSITORY: Symbol('FILE_REPOSITORY'),

  // Admin analytics (cross-tenant, SaaS owner only)
  ADMIN_ANALYTICS_QUERY_REPOSITORY: Symbol(
    'ADMIN_ANALYTICS_QUERY_REPOSITORY',
  ),
  ADMIN_ANALYTICS_INGEST_REPOSITORY: Symbol(
    'ADMIN_ANALYTICS_INGEST_REPOSITORY',
  ),
} as const;

export type ElasticSearchRepositoryTokens =
  (typeof ELASTICSEARCH_REPOSITORY_TOKENS)[keyof typeof ELASTICSEARCH_REPOSITORY_TOKENS];

