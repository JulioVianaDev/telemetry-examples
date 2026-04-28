import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { context, propagation, SpanKind, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { Message } from './message.entity';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class MessageConsumer implements OnModuleInit {
  private readonly tracer: Tracer;
  private readonly dbTracer: Tracer;

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
  ) {
    const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

    const consumerProvider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'consumer',
      }),
      spanProcessors: [
        new SimpleSpanProcessor(new OTLPTraceExporter({ url: exporterUrl })),
      ],
    });
    this.tracer = consumerProvider.getTracer('message-consumer');

    const dbProvider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'pg-query',
      }),
      spanProcessors: [
        new SimpleSpanProcessor(new OTLPTraceExporter({ url: exporterUrl })),
      ],
    });
    this.dbTracer = dbProvider.getTracer('pg-query');
  }

  async onModuleInit() {
    await this.rabbitmqService.consume(
      RabbitmqService.QUEUE,
      async (msg) => {
        const headers = (msg.properties.headers ?? {}) as Record<string, string>;
        const parentContext = propagation.extract(context.active(), headers);

        await context.with(parentContext, async () => {
          await this.tracer.startActiveSpan(
            'messages process',
            { kind: SpanKind.CONSUMER },
            async (span) => {
              try {
                const data = JSON.parse(msg.content.toString());
                span.setAttribute('messaging.message_id', data.id);
                console.log(`[Consumer] processing message ${data.id}`);

                await this.dbTracer.startActiveSpan(
                  'UPDATE messages SET status = $1 WHERE id = $2',
                  {
                    kind: SpanKind.CLIENT,
                    attributes: {
                      'db.system': 'postgresql',
                      'db.name': process.env.DB_NAME || 'backend',
                      'db.operation': 'UPDATE',
                      'db.sql.table': 'messages',
                      'db.statement': 'UPDATE messages SET status = $1 WHERE id = $2',
                    },
                  },
                  async (dbSpan) => {
                    try {
                      await this.messageRepo.update(data.id, { status: 'processed' });
                    } catch (err) {
                      dbSpan.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
                      throw err;
                    } finally {
                      dbSpan.end();
                    }
                  },
                );

                console.log(`[Consumer] message ${data.id} processed`);
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
    console.log('[Consumer] listening on queue "messages"');
  }
}
