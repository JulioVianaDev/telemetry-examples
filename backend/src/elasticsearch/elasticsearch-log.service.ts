import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { trace } from '@opentelemetry/api';
import { ELASTICSEARCH_TOKEN } from './tokens/elasticsearch-token';

const INDEX_NAME = 'app-logs';

@Injectable()
export class ElasticsearchLogService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchLogService.name);

  constructor(
    @Inject(ELASTICSEARCH_TOKEN)
    private readonly esClient: Client,
  ) {}

  async onModuleInit() {
    try {
      const exists = await this.esClient.indices.exists({ index: INDEX_NAME });
      if (!exists) {
        await this.esClient.indices.create({
          index: INDEX_NAME,
          mappings: {
            properties: {
              action: { type: 'keyword' },
              entityId: { type: 'keyword' },
              entityType: { type: 'keyword' },
              message: { type: 'text' },
              tenantId: { type: 'keyword' },
              timestamp: { type: 'date' },
              metadata: { type: 'object' },
            },
          },
        });
        this.logger.log(`Index "${INDEX_NAME}" created`);
      }
    } catch (err) {
      this.logger.warn(`Could not initialize index "${INDEX_NAME}": ${(err as Error).message}`);
    }
  }

  async log(params: {
    action: string;
    entityId: string;
    entityType: string;
    message: string;
    tenantId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const tracer = trace.getTracer('elasticsearch-log');
    return tracer.startActiveSpan('es:index-log', async (span) => {
      try {
        span.setAttribute('db.system', 'elasticsearch');
        span.setAttribute('db.operation', 'index');
        span.setAttribute('es.index', INDEX_NAME);
        span.setAttribute('es.action', params.action);
        span.setAttribute('es.entity_type', params.entityType);

        const result = await this.esClient.index({
          index: INDEX_NAME,
          document: {
            ...params,
            timestamp: new Date().toISOString(),
          },
        });

        span.setAttribute('es.result', result.result);
        return result;
      } catch (err) {
        span.recordException(err as Error);
        this.logger.error(`Failed to index log: ${(err as Error).message}`);
        // Don't rethrow — logging should not break the main flow
      } finally {
        span.end();
      }
    });
  }

  async search(term: string, options?: { from?: number; size?: number }) {
    const tracer = trace.getTracer('elasticsearch-log');
    return tracer.startActiveSpan('es:search-logs', async (span) => {
      try {
        span.setAttribute('db.system', 'elasticsearch');
        span.setAttribute('db.operation', 'search');
        span.setAttribute('es.index', INDEX_NAME);
        span.setAttribute('es.search_term', term);

        const result = await this.esClient.search({
          index: INDEX_NAME,
          query: {
            multi_match: {
              query: term,
              fields: ['message', 'action', 'entityType', 'entityId'],
            },
          },
          from: options?.from ?? 0,
          size: options?.size ?? 20,
          sort: [{ timestamp: { order: 'desc' as const } }],
        });

        const total =
          typeof result.hits.total === 'number'
            ? result.hits.total
            : result.hits.total?.value ?? 0;

        span.setAttribute('es.hits_total', total);
        span.setAttribute('es.hits_returned', result.hits.hits.length);

        return {
          total,
          hits: result.hits.hits.map((h) => h._source),
        };
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
