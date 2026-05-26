import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  context,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { Message } from './message.entity';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { MOCK_USERS } from '../users.mock';

export interface TenantStatsPayload {
  tenantId: string;
  userId: string;
  userName: string;
  totalMessages: number;
  pendingCount: number;
  processedCount: number;
  collectedAt: string;
}

@Injectable()
export class MessageCronService {
  private readonly logger = new Logger(MessageCronService.name);
  private readonly tracer = trace.getTracer('message-cron');

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  /**
   * Runs every 2 minutes.
   * For each tenant: counts messages by status in the database,
   * logs the stats, and publishes them to the "message-stats" queue.
   */
  @Cron('*/2 * * * *')
  async handleMessageStats() {
    const tenantIds = [
      ...new Set(
        MOCK_USERS.filter((u) => u.tenantId).map((u) => u.tenantId!),
      ),
    ];

    this.logger.log(
      `[Cron] Starting message stats collection for ${tenantIds.length} tenants`,
    );

    await this.tracer.startActiveSpan(
      'cron:message-stats-collection',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.schedule': 'every_2_minutes',
          'cron.job': 'message-stats-collection',
          'cron.tenants.count': tenantIds.length,
        },
      },
      async (cronSpan) => {
        try {
          for (const tenantId of tenantIds) {
            const tenantUser = MOCK_USERS.find(
              (u) => u.tenantId === tenantId,
            );

            await this.collectAndPublishTenantStats(
              tenantId,
              tenantUser?.id ?? 'system',
              tenantUser?.name ?? 'system',
            );
          }

          cronSpan.setStatus({ code: SpanStatusCode.OK });
          this.logger.log(`[Cron] Stats collection complete`);
        } catch (err) {
          cronSpan.recordException(err as Error);
          cronSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          this.logger.error(`[Cron] Stats collection failed`, (err as Error).stack);
        } finally {
          cronSpan.end();
        }
      },
    );
  }

  private async collectAndPublishTenantStats(
    tenantId: string,
    userId: string,
    userName: string,
  ): Promise<void> {
    await this.tracer.startActiveSpan(
      'cron:collect-tenant-stats',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.job': 'message-stats-collection',
          'tenant.id': tenantId,
          'user.id': userId,
          'user.name': userName,
        },
      },
      async (tenantSpan) => {
        try {
          const stats = await this.queryTenantMessageCounts(tenantId);

          tenantSpan.setAttribute('stats.total', stats.total);
          tenantSpan.setAttribute('stats.pending', stats.pending);
          tenantSpan.setAttribute('stats.processed', stats.processed);

          this.logger.log(
            `[Cron] Tenant ${tenantId}: total=${stats.total} pending=${stats.pending} processed=${stats.processed}`,
          );

          const payload: TenantStatsPayload = {
            tenantId,
            userId,
            userName,
            totalMessages: stats.total,
            pendingCount: stats.pending,
            processedCount: stats.processed,
            collectedAt: new Date().toISOString(),
          };

          await this.publishStats(payload);

          tenantSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          tenantSpan.recordException(err as Error);
          tenantSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          throw err;
        } finally {
          tenantSpan.end();
        }
      },
    );
  }

  private async queryTenantMessageCounts(
    tenantId: string,
  ): Promise<{ total: number; pending: number; processed: number }> {
    return await this.tracer.startActiveSpan(
      'cron:query-message-counts',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'span.source': 'cron',
          'cron.job': 'message-stats-collection',
          'tenant.id': tenantId,
          'db.operation': 'SELECT COUNT',
          'db.table': 'messages',
        },
      },
      async (querySpan) => {
        try {
          const [total, pending, processed] = await Promise.all([
            this.messageRepo.count({ where: { tenantId } }),
            this.messageRepo.count({ where: { tenantId, status: 'pending' } }),
            this.messageRepo.count({ where: { tenantId, status: 'processed' } }),
          ]);

          querySpan.setAttribute('query.total', total);
          querySpan.setAttribute('query.pending', pending);
          querySpan.setAttribute('query.processed', processed);
          querySpan.setStatus({ code: SpanStatusCode.OK });

          return { total, pending, processed };
        } catch (err) {
          querySpan.recordException(err as Error);
          querySpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          throw err;
        } finally {
          querySpan.end();
        }
      },
    );
  }

  private async publishStats(payload: TenantStatsPayload): Promise<void> {
    await this.tracer.startActiveSpan(
      'cron:publish-stats',
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          'span.source': 'cron',
          'cron.job': 'message-stats-collection',
          'messaging.system': 'rabbitmq',
          'messaging.destination': RabbitmqService.STATS_QUEUE,
          'messaging.operation': 'stats',
          'tenant.id': payload.tenantId,
          'user.id': payload.userId,
          'user.name': payload.userName,
        },
      },
      async (publishSpan) => {
        try {
          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);

          await this.rabbitmqService.publish(
            RabbitmqService.STATS_QUEUE,
            payload,
            headers,
          );

          publishSpan.setStatus({ code: SpanStatusCode.OK });
          this.logger.log(
            `[Cron] Published stats for tenant ${payload.tenantId} to ${RabbitmqService.STATS_QUEUE}`,
          );
        } catch (err) {
          publishSpan.recordException(err as Error);
          publishSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          throw err;
        } finally {
          publishSpan.end();
        }
      },
    );
  }
}
