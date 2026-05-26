import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { context, propagation, SpanKind, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { MessageStats } from './message-stats.entity';
import { TenantStatsPayload } from './message-cron.service';

@Injectable()
export class StatsConsumer implements OnModuleInit {
  private readonly logger = new Logger(StatsConsumer.name);
  private readonly tracer: Tracer;

  constructor(
    @InjectRepository(MessageStats)
    private readonly statsRepo: Repository<MessageStats>,
    private readonly rabbitmqService: RabbitmqService,
  ) {
    const statsProvider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'stats-consumer',
      }),
      spanProcessors: [
        new SimpleSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4317',
          }),
        ),
      ],
    });
    this.tracer = statsProvider.getTracer('stats-consumer');
  }

  async onModuleInit() {
    await this.rabbitmqService.consume(
      RabbitmqService.STATS_QUEUE,
      async (msg) => {
        const headers = (msg.properties.headers ?? {}) as Record<string, string>;
        const parentContext = propagation.extract(context.active(), headers);

        await context.with(parentContext, async () => {
          await this.tracer.startActiveSpan(
            'stats:process',
            { kind: SpanKind.CONSUMER, attributes: { 'span.source': 'cron' } },
            async (span) => {
              try {
                const data: TenantStatsPayload = JSON.parse(msg.content.toString());

                span.setAttribute('tenant.id', data.tenantId);
                span.setAttribute('user.id', data.userId);
                span.setAttribute('user.name', data.userName);
                span.setAttribute('stats.total', data.totalMessages);
                span.setAttribute('stats.pending', data.pendingCount);
                span.setAttribute('stats.processed', data.processedCount);
                span.setAttribute('stats.collected_at', data.collectedAt);

                // Save stats to database
                await this.tracer.startActiveSpan(
                  'stats:save-to-db',
                  {
                    kind: SpanKind.INTERNAL,
                    attributes: {
                      'span.source': 'cron',
                      'db.operation': 'INSERT',
                      'db.table': 'message_stats',
                      'tenant.id': data.tenantId,
                    },
                  },
                  async (dbSpan) => {
                    try {
                      const statsRecord = this.statsRepo.create({
                        tenantId: data.tenantId,
                        userId: data.userId,
                        userName: data.userName,
                        totalMessages: data.totalMessages,
                        pendingCount: data.pendingCount,
                        processedCount: data.processedCount,
                      });

                      await this.statsRepo.save(statsRecord);

                      dbSpan.setAttribute('stats.record_id', statsRecord.id);
                      dbSpan.setStatus({ code: SpanStatusCode.OK });

                      this.logger.log(
                        `[Stats] Saved stats record ${statsRecord.id} for tenant "${data.tenantId}"`,
                      );
                    } catch (err) {
                      dbSpan.recordException(err as Error);
                      dbSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: (err as Error).message,
                      });
                      throw err;
                    } finally {
                      dbSpan.end();
                    }
                  },
                );

                this.logger.log(
                  `[Stats] Tenant "${data.tenantId}" (user: ${data.userName}) — ` +
                  `total: ${data.totalMessages}, pending: ${data.pendingCount}, processed: ${data.processedCount}`,
                );

                if (data.pendingCount > 0) {
                  this.logger.warn(
                    `[Stats] Tenant "${data.tenantId}" has ${data.pendingCount} pending messages waiting to be processed`,
                  );
                  span.setAttribute('stats.has_pending', true);
                }

                if (data.totalMessages === 0) {
                  this.logger.log(
                    `[Stats] Tenant "${data.tenantId}" has no messages in the database`,
                  );
                }
              } catch (err) {
                span.recordException(err as Error);
                throw err;
              } finally {
                span.end();
              }
            },
          );
        });
      },
    );
    this.logger.log(`Listening on queue "${RabbitmqService.STATS_QUEUE}"`);
  }
}
