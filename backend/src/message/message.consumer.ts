import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { context, propagation, SpanKind, Tracer } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { Message } from './message.entity';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class MessageConsumer implements OnModuleInit {
  private readonly tracer: Tracer;

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
  ) {
    const consumerProvider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'consumer',
      }),
      spanProcessors: [
        new SimpleSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
          }),
        ),
      ],
    });
    this.tracer = consumerProvider.getTracer('message-consumer');
  }

  async onModuleInit() {
    // consume create messages
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
                span.setAttribute('messaging.operation', 'create');
                console.log(`[Consumer] processing message ${data.id}`);

                await this.messageRepo.update(data.id, { status: 'processed' });

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

    // consume update messages
    await this.rabbitmqService.consume(
      RabbitmqService.UPDATES_QUEUE,
      async (msg) => {
        const headers = (msg.properties.headers ?? {}) as Record<string, string>;
        const parentContext = propagation.extract(context.active(), headers);

        await context.with(parentContext, async () => {
          await this.tracer.startActiveSpan(
            'message-update process',
            { kind: SpanKind.CONSUMER },
            async (span) => {
              try {
                const data = JSON.parse(msg.content.toString());
                span.setAttribute('messaging.message_id', data.id);
                span.setAttribute('messaging.operation', 'update');
                span.setAttribute('messaging.content', data.content);
                console.log(`[Consumer] processing update for message ${data.id}`);

                await this.messageRepo.update(data.id, {
                  status: 'processed',
                  content: data.content,
                });

                console.log(`[Consumer] message ${data.id} update processed`);
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
    console.log('[Consumer] listening on queue "message-updates"');
  }
}
