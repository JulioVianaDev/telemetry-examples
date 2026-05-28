import { Global, Module } from '@nestjs/common';
import {
  elasticsearchProvider,
  elasticsearchRepositoryProviders,
} from './elasticsearch.providers';
import { ELASTICSEARCH_TOKEN } from './tokens/elasticsearch-token';
import { ElasticsearchLogService } from './elasticsearch-log.service';

@Global()
@Module({
  providers: [
    elasticsearchProvider,
    ...elasticsearchRepositoryProviders,
    ElasticsearchLogService,
  ],
  exports: [
    ELASTICSEARCH_TOKEN,
    ElasticsearchLogService,
    // Uncomment when repositories are registered:
    // ELASTICSEARCH_REPOSITORY_TOKENS.FILE_REPOSITORY,
    // ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY,
  ],
})
export class ElasticSearchModule {}

