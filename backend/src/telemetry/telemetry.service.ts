import { Injectable, Inject, Logger } from '@nestjs/common';
import { trace, SpanKind } from '@opentelemetry/api';
import { REDIS_TOKENS } from '../redis/tokens/redis-tokens';
import { RedisCacheService } from '../redis/redis-cache.service';
import { ELASTICSEARCH_REPOSITORY_TOKENS } from '../elasticsearch/tokens/repository-tokens';
import { TelemetryElasticSearchRepository } from './telemetry.elasticsearch.repository';
import { TelemetryGateway } from './telemetry.gateway';
import { TelemetryEvent, TelemetryStats } from './telemetry-event.interface';

const TRACER_NAME = 'telemetry-service';
const CACHE_PREFIX = 'telemetry';
const CACHE_TTL = 30; // 30 seconds

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @Inject(REDIS_TOKENS.REDIS_CACHE_SERVICE)
    private readonly cache: RedisCacheService,
    @Inject(ELASTICSEARCH_REPOSITORY_TOKENS.LOG_REPOSITORY)
    private readonly telemetryRepo: TelemetryElasticSearchRepository,
    private readonly gateway: TelemetryGateway,
  ) {}

  async ingest(event: Omit<TelemetryEvent, 'timestamp'>): Promise<{ id: string }> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'telemetry.ingest',
      { kind: SpanKind.INTERNAL },
      async (span) => {
        try {
          const fullEvent: TelemetryEvent = {
            ...event,
            timestamp: new Date().toISOString(),
          };

          span.setAttribute('telemetry.event.type', fullEvent.type);
          span.setAttribute('telemetry.event.operation', fullEvent.operation);
          span.setAttribute('telemetry.event.service', fullEvent.service);
          if (fullEvent.tenant_id) span.setAttribute('tenant.id', fullEvent.tenant_id);

          // 1. Index in Elasticsearch
          const docId = await tracer.startActiveSpan(
            'telemetry.ingest.elasticsearch',
            { kind: SpanKind.CLIENT },
            async (esSpan) => {
              esSpan.setAttribute('db.system', 'elasticsearch');
              esSpan.setAttribute('db.operation', 'index');
              const id = await this.telemetryRepo.index(fullEvent);
              esSpan.setAttribute('db.elasticsearch.doc_id', id);
              esSpan.end();
              return id;
            },
          );

          // 2. Invalidate cached stats
          await tracer.startActiveSpan(
            'telemetry.ingest.cache_invalidate',
            { kind: SpanKind.CLIENT },
            async (cacheSpan) => {
              cacheSpan.setAttribute('db.system', 'redis');
              cacheSpan.setAttribute('db.operation', 'deleteByPrefix');
              cacheSpan.setAttribute('cache.prefix', `${CACHE_PREFIX}:stats`);
              await this.cache.deleteByPrefix(`${CACHE_PREFIX}:stats`);
              cacheSpan.end();
            },
          );

          // 3. Broadcast via WebSocket to all connected clients
          fullEvent.id = docId;
          this.gateway.broadcastEvent(fullEvent);

          span.setAttribute('telemetry.ingest.doc_id', docId);
          return { id: docId };
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
      'telemetry.search',
      { kind: SpanKind.INTERNAL },
      async (span) => {
        try {
          const cacheKey = `${CACHE_PREFIX}:search:${JSON.stringify(params)}`;
          span.setAttribute('cache.key', cacheKey);

          // Try Redis cache first
          const cached = await tracer.startActiveSpan(
            'telemetry.search.cache_get',
            { kind: SpanKind.CLIENT },
            async (cacheSpan) => {
              cacheSpan.setAttribute('db.system', 'redis');
              cacheSpan.setAttribute('db.operation', 'GET');
              cacheSpan.setAttribute('cache.key', cacheKey);
              const result = await this.cache.getData<{ data: TelemetryEvent[]; total: number }>(cacheKey);
              cacheSpan.setAttribute('cache.hit', result !== null);
              cacheSpan.end();
              return result;
            },
          );

          if (cached) {
            span.setAttribute('cache.hit', true);
            // Track cache hit in ES
            this.trackCacheEvent('cache_hit', 'search', params.tenant_id);
            return cached;
          }

          span.setAttribute('cache.hit', false);
          this.trackCacheEvent('cache_miss', 'search', params.tenant_id);

          // Query Elasticsearch
          const result = await this.telemetryRepo.search(params);

          // Cache the result
          await tracer.startActiveSpan(
            'telemetry.search.cache_set',
            { kind: SpanKind.CLIENT },
            async (cacheSpan) => {
              cacheSpan.setAttribute('db.system', 'redis');
              cacheSpan.setAttribute('db.operation', 'SET');
              cacheSpan.setAttribute('cache.key', cacheKey);
              cacheSpan.setAttribute('cache.ttl', CACHE_TTL);
              await this.cache.saveData({ key: cacheKey, data: result, time: CACHE_TTL });
              cacheSpan.end();
            },
          );

          return result;
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
      'telemetry.get_stats',
      { kind: SpanKind.INTERNAL },
      async (span) => {
        try {
          const cacheKey = `${CACHE_PREFIX}:stats:${tenant_id ?? 'all'}`;
          span.setAttribute('cache.key', cacheKey);
          if (tenant_id) span.setAttribute('tenant.id', tenant_id);

          // Try Redis cache
          const cached = await tracer.startActiveSpan(
            'telemetry.stats.cache_get',
            { kind: SpanKind.CLIENT },
            async (cacheSpan) => {
              cacheSpan.setAttribute('db.system', 'redis');
              cacheSpan.setAttribute('db.operation', 'GET');
              cacheSpan.setAttribute('cache.key', cacheKey);
              const result = await this.cache.getData<TelemetryStats>(cacheKey);
              cacheSpan.setAttribute('cache.hit', result !== null);
              cacheSpan.end();
              return result;
            },
          );

          if (cached) {
            span.setAttribute('cache.hit', true);
            this.trackCacheEvent('cache_hit', 'stats', tenant_id);
            // Broadcast stats via WebSocket
            this.gateway.broadcastStats({ ...cached, source: 'cache' });
            return cached;
          }

          span.setAttribute('cache.hit', false);
          this.trackCacheEvent('cache_miss', 'stats', tenant_id);

          // Query Elasticsearch aggregations
          const stats = await this.telemetryRepo.getStats(tenant_id);

          // Cache stats
          await tracer.startActiveSpan(
            'telemetry.stats.cache_set',
            { kind: SpanKind.CLIENT },
            async (cacheSpan) => {
              cacheSpan.setAttribute('db.system', 'redis');
              cacheSpan.setAttribute('db.operation', 'SET');
              cacheSpan.setAttribute('cache.key', cacheKey);
              cacheSpan.setAttribute('cache.ttl', CACHE_TTL);
              await this.cache.saveData({ key: cacheKey, data: stats, time: CACHE_TTL });
              cacheSpan.end();
            },
          );

          // Broadcast fresh stats via WebSocket
          this.gateway.broadcastStats({ ...stats, source: 'elasticsearch' });

          return stats;
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  async getRedisInfo(): Promise<Record<string, unknown>> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'telemetry.redis_info',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'redis');
          span.setAttribute('db.operation', 'INFO');

          const client = this.cache.getClient();
          const info = await client.info();

          const parsed: Record<string, string> = {};
          for (const line of info.split('\r\n')) {
            if (line && !line.startsWith('#')) {
              const [key, value] = line.split(':');
              if (key && value) parsed[key] = value;
            }
          }

          const result = {
            connected_clients: parsed.connected_clients,
            used_memory_human: parsed.used_memory_human,
            used_memory_peak_human: parsed.used_memory_peak_human,
            total_commands_processed: parsed.total_commands_processed,
            keyspace_hits: parsed.keyspace_hits,
            keyspace_misses: parsed.keyspace_misses,
            uptime_in_seconds: parsed.uptime_in_seconds,
            redis_version: parsed.redis_version,
          };

          span.setAttribute('redis.connected_clients', parsed.connected_clients ?? 'unknown');
          span.setAttribute('redis.used_memory', parsed.used_memory_human ?? 'unknown');

          return result;
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  async getElasticsearchHealth(): Promise<Record<string, unknown>> {
    const tracer = trace.getTracer(TRACER_NAME);
    return await tracer.startActiveSpan(
      'telemetry.elasticsearch_health',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('db.system', 'elasticsearch');
          span.setAttribute('db.operation', 'cluster.health');

          const result = await this.telemetryRepo.search({ size: 0 });
          span.setAttribute('elasticsearch.total_docs', result.total);

          return {
            index: 'telemetry-events',
            total_documents: result.total,
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

  private trackCacheEvent(type: 'cache_hit' | 'cache_miss', operation: string, tenant_id?: string) {
    // Fire-and-forget: index the cache event asynchronously
    this.telemetryRepo
      .index({
        type,
        operation,
        service: 'telemetry-service',
        status: 'success',
        tenant_id,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => this.logger.warn(`Failed to track ${type}: ${err.message}`));
  }
}
