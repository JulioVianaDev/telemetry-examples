import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { trace, SpanKind } from '@opentelemetry/api';
import { ELASTICSEARCH_TOKEN } from '../elasticsearch/tokens/elasticsearch-token';
import { TelemetryEvent, TelemetryStats } from './telemetry-event.interface';

const INDEX = 'telemetry-events';
const TRACER_NAME = 'telemetry-es-repository';

@Injectable()
export class TelemetryElasticSearchRepository implements OnModuleInit {
  private readonly logger = new Logger(TelemetryElasticSearchRepository.name);

  constructor(
    @Inject(ELASTICSEARCH_TOKEN)
    private readonly esClient: Client,
  ) {}

  async onModuleInit() {
    const tracer = trace.getTracer(TRACER_NAME);
    await tracer.startActiveSpan(
      'elasticsearch.ensure_index',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'elasticsearch');
          span.setAttribute('db.operation', 'indices.exists');
          span.setAttribute('db.elasticsearch.index', INDEX);

          const exists = await this.esClient.indices.exists({ index: INDEX });
          if (!exists) {
            span.addEvent('creating_index');
            await this.esClient.indices.create({
              index: INDEX,
              mappings: {
                properties: {
                  type: { type: 'keyword' },
                  operation: { type: 'keyword' },
                  service: { type: 'keyword' },
                  duration_ms: { type: 'float' },
                  status: { type: 'keyword' },
                  metadata: { type: 'object', enabled: false },
                  tenant_id: { type: 'keyword' },
                  user_id: { type: 'keyword' },
                  timestamp: { type: 'date' },
                },
              },
            });
            this.logger.log(`Index "${INDEX}" created`);
          }
        } catch (err) {
          span.recordException(err as Error);
          this.logger.warn(`Could not ensure index "${INDEX}": ${(err as Error).message}`);
        } finally {
          span.end();
        }
      },
    );
  }

  async index(event: TelemetryEvent): Promise<string> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'elasticsearch.index',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'elasticsearch');
          span.setAttribute('db.operation', 'index');
          span.setAttribute('db.elasticsearch.index', INDEX);
          span.setAttribute('telemetry.event.type', event.type);
          span.setAttribute('telemetry.event.operation', event.operation);

          // Extract id to avoid conflict with ES index params
          const { id: _id, ...document } = event;

          const result = await this.esClient.index({
            index: INDEX,
            document,
            refresh: 'wait_for',
          });

          span.setAttribute('db.elasticsearch.doc_id', result._id);
          return result._id;
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  async search(params: {
    type?: string;
    service?: string;
    status?: string;
    tenant_id?: string;
    from?: number;
    size?: number;
  }): Promise<{ data: TelemetryEvent[]; total: number }> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'elasticsearch.search',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'elasticsearch');
          span.setAttribute('db.operation', 'search');
          span.setAttribute('db.elasticsearch.index', INDEX);

          const must: Record<string, unknown>[] = [];
          if (params.type) must.push({ term: { type: params.type } });
          if (params.service) must.push({ term: { service: params.service } });
          if (params.status) must.push({ term: { status: params.status } });
          if (params.tenant_id) must.push({ term: { tenant_id: params.tenant_id } });

          span.setAttribute('db.elasticsearch.query_filters', must.length);

          const result = await this.esClient.search({
            index: INDEX,
            query: must.length > 0 ? { bool: { must } } : { match_all: {} },
            sort: [{ timestamp: { order: 'desc' as const } }],
            from: params.from ?? 0,
            size: params.size ?? 20,
          });

          const hits = result.hits.hits;
          const total =
            typeof result.hits.total === 'number'
              ? result.hits.total
              : result.hits.total?.value ?? 0;

          span.setAttribute('db.elasticsearch.hits', hits.length);
          span.setAttribute('db.elasticsearch.total', total);

          const data = hits.map((hit) => ({
            id: hit._id,
            ...(hit._source as TelemetryEvent),
          }));

          return { data, total };
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  async getStats(tenant_id?: string): Promise<TelemetryStats> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'elasticsearch.aggregate_stats',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'elasticsearch');
          span.setAttribute('db.operation', 'search_aggregation');
          span.setAttribute('db.elasticsearch.index', INDEX);

          const result = await this.esClient.search({
            index: INDEX,
            size: 0,
            query: tenant_id ? { term: { tenant_id } } : { match_all: {} },
            aggs: {
              by_type: { terms: { field: 'type' } },
              by_status: { terms: { field: 'status' } },
              avg_duration: { avg: { field: 'duration_ms' } },
              cache_hits: {
                filter: { term: { type: 'cache_hit' } },
              },
              cache_total: {
                filter: {
                  terms: { type: ['cache_hit', 'cache_miss'] },
                },
              },
            },
          });

          const aggs = result.aggregations as any;
          const total =
            typeof result.hits.total === 'number'
              ? result.hits.total
              : result.hits.total?.value ?? 0;

          const byType: Record<string, number> = {};
          for (const bucket of aggs?.by_type?.buckets ?? []) {
            byType[bucket.key] = bucket.doc_count;
          }

          const byStatus: Record<string, number> = {};
          for (const bucket of aggs?.by_status?.buckets ?? []) {
            byStatus[bucket.key] = bucket.doc_count;
          }

          const cacheHits = aggs?.cache_hits?.doc_count ?? 0;
          const cacheTotal = aggs?.cache_total?.doc_count ?? 0;

          span.setAttribute('telemetry.stats.total', total);

          return {
            total_events: total,
            by_type: byType,
            by_status: byStatus,
            avg_duration_ms: aggs?.avg_duration?.value ?? 0,
            cache_hit_rate: cacheTotal > 0 ? cacheHits / cacheTotal : 0,
          };
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }
}
