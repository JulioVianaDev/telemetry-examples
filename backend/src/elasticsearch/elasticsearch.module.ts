import { Global, Module } from '@nestjs/common';
import {
  elasticsearchProvider,
  elasticsearchRepositoryProviders,
} from './elasticsearch.providers';
import { ELASTICSEARCH_TOKEN } from './tokens/elasticsearch-token';
import { ELASTICSEARCH_REPOSITORY_TOKENS } from './tokens/repository-tokens';

/**
 * Global ElasticSearch Module
 * 
 * Provides ElasticSearch-based repositories for the entire application.
 * 
 * Usage in services:
 * @example
 * ```typescript
 * import { ELASTICSEARCH_REPOSITORY_TOKENS } from '@infra/elasticsearch';
 * 
 * @Injectable()
 * export class ProductService {
 *   constructor(
 *     @Inject(ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY)
 *     private readonly productRepository: IProductContractRepository,
 *   ) {}
 * }
 * ```
 */
@Global()
@Module({
  providers: [
    elasticsearchProvider,
    ...elasticsearchRepositoryProviders,
  ],
  exports: [
    ELASTICSEARCH_TOKEN,
    // Only export tokens that have corresponding providers registered
    ELASTICSEARCH_REPOSITORY_TOKENS.LOG_REPOSITORY,
    // Uncomment when repositories are registered:
    // ELASTICSEARCH_REPOSITORY_TOKENS.FILE_REPOSITORY,
    // ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY,
  ],
})
export class ElasticSearchModule {}

