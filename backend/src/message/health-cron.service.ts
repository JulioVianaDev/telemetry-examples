import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { Message } from './message.entity';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class HealthCronService {
  private readonly logger = new Logger(HealthCronService.name);
  private readonly tracer = trace.getTracer('health-cron');

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @Cron('*/2 * * * *')
  async pingDatabase() {
    this.logger.log('[Cron] Starting ping-database health check');

    await this.tracer.startActiveSpan(
      'cron:ping-database',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.schedule': 'every_2_minutes',
          'cron.job': 'ping-database',
        },
      },
      async (rootSpan) => {
        let pgOk = false;
        let rabbitOk = false;

        try {
          // 1. Check PostgreSQL
          pgOk = await this.checkPostgres();

          // 2. Check RabbitMQ
          rabbitOk = await this.checkRabbitmq();

          rootSpan.setAttribute('health.postgres', pgOk ? 'UP' : 'DOWN');
          rootSpan.setAttribute('health.rabbitmq', rabbitOk ? 'UP' : 'DOWN');

          const allHealthy = pgOk && rabbitOk;
          rootSpan.setAttribute('health.status', allHealthy ? 'healthy' : 'degraded');

          if (allHealthy) {
            rootSpan.setStatus({ code: SpanStatusCode.OK });
            this.logger.log(
              '[Cron] ping-database: all services healthy — postgres=UP rabbitmq=UP',
            );
          } else {
            rootSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `Degraded: postgres=${pgOk ? 'UP' : 'DOWN'} rabbitmq=${rabbitOk ? 'UP' : 'DOWN'}`,
            });
            this.logger.error(
              `[Cron] ping-database: DEGRADED — postgres=${pgOk ? 'UP' : 'DOWN'} rabbitmq=${rabbitOk ? 'UP' : 'DOWN'}`,
            );
          }
        } catch (err) {
          rootSpan.recordException(err as Error);
          rootSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          this.logger.error(
            '[Cron] ping-database: health check failed',
            (err as Error).stack,
          );
        } finally {
          rootSpan.end();
        }
      },
    );
  }

  private async checkPostgres(): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'cron:ping-postgres',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.job': 'ping-database',
          'db.system': 'postgresql',
        },
      },
      async (span) => {
        try {
          const start = Date.now();
          const result = await this.messageRepo.query('SELECT 1 AS ok');
          const latencyMs = Date.now() - start;

          span.setAttribute('health.postgres', 'UP');
          span.setAttribute('health.postgres_latency_ms', latencyMs);
          span.setAttribute('health.postgres_result', JSON.stringify(result));
          span.setStatus({ code: SpanStatusCode.OK });

          this.logger.log(
            `[Cron] ping-database: postgres=UP latency=${latencyMs}ms`,
          );
          return true;
        } catch (err) {
          span.setAttribute('health.postgres', 'DOWN');
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });

          this.logger.error(
            `[Cron] ping-database: postgres=DOWN error=${(err as Error).message}`,
          );
          return false;
        } finally {
          span.end();
        }
      },
    );
  }

  private async checkRabbitmq(): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'cron:ping-rabbitmq',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.job': 'ping-database',
          'messaging.system': 'rabbitmq',
        },
      },
      async (span) => {
        try {
          const start = Date.now();
          const health = await this.rabbitmqService.healthCheck();
          const latencyMs = Date.now() - start;

          span.setAttribute('health.rabbitmq', health.connected ? 'UP' : 'DOWN');
          span.setAttribute('health.rabbitmq_latency_ms', latencyMs);
          span.setAttribute('health.rabbitmq_queue_messages', health.queues);

          if (health.connected) {
            span.setStatus({ code: SpanStatusCode.OK });
            this.logger.log(
              `[Cron] ping-database: rabbitmq=UP latency=${latencyMs}ms queue_messages=${health.queues}`,
            );
            return true;
          } else {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'RabbitMQ not connected' });
            this.logger.error('[Cron] ping-database: rabbitmq=DOWN');
            return false;
          }
        } catch (err) {
          span.setAttribute('health.rabbitmq', 'DOWN');
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });

          this.logger.error(
            `[Cron] ping-database: rabbitmq=DOWN error=${(err as Error).message}`,
          );
          return false;
        } finally {
          span.end();
        }
      },
    );
  }
}
