import { Provider } from '@nestjs/common';
import { Client as ElasticSearchClient } from '@elastic/elasticsearch';
import { ELASTICSEARCH_TOKEN } from './tokens/elasticsearch-token';
import { ELASTICSEARCH_REPOSITORY_TOKENS } from './tokens/repository-tokens';

// Repository imports
// import { FileElasticSearchRepository } from '../../modules/file/repositories/file.elasticsearch.repository';

// Repository imports (uncomment when ready)
// import { ProductElasticSearchRepository } from '../../products/repositories/product.elastic-search.repository';
// import { LogElasticSearchRepository } from '../../logs/repositories/log.elastic-search.repository';

/**
 * ElasticSearch client provider
 */
export const elasticsearchProvider: Provider = {
  provide: ELASTICSEARCH_TOKEN,
  useFactory: () => {
    const client = new ElasticSearchClient({
      node: process.env.ELASTIC_SEARCH_URL || 'http://127.0.0.1:9200',
      maxRetries: 3,
      requestTimeout: 60000,
    });
    return client;
  },
};

/**
 * All ElasticSearch repository providers
 */
export const elasticsearchRepositoryProviders: Provider[] = [
  // Files
  // FileElasticSearchRepository,
  // {
  //   provide: ELASTICSEARCH_REPOSITORY_TOKENS.FILE_REPOSITORY,
  //   useExisting: FileElasticSearchRepository,
  // },

  // Products (uncomment when ready)
  // ProductElasticSearchRepository,
  // {
  //   provide: ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY,
  //   useExisting: ProductElasticSearchRepository,
  // },

  // Logs (uncomment when ready)
  // LogElasticSearchRepository,
  // {
  //   provide: ELASTICSEARCH_REPOSITORY_TOKENS.LOG_REPOSITORY,
  //   useExisting: LogElasticSearchRepository,
  // },
];

