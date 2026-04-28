import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { context, propagation, trace, SpanKind } from '@opentelemetry/api';
import { Message } from './message.entity';
import { CreateMessageDto } from './create-message.dto';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { ConsoleService } from './console.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
    private readonly consoleService: ConsoleService,
  ) { }

  async create(dto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepo.create({
      content: dto.content,
      status: 'pending',
    });
    const saved = await this.messageRepo.save(message);

    const tracer = trace.getTracer('message-service');
    this.consoleService.log('Creating message');
    // random delay 0-50ms
    const delay = Math.floor(Math.random() * 51);
    await tracer.startActiveSpan('random timeout', async (timeoutSpan) => {
      timeoutSpan.setAttribute('delay.ms', delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      timeoutSpan.end();
    });
    return await tracer.startActiveSpan(
      'send to queue',
      { kind: SpanKind.PRODUCER },
      async (span) => {
        try {
          span.setAttribute('messaging.system', 'rabbitmq');
          span.setAttribute('messaging.destination', RabbitmqService.QUEUE);
          span.setAttribute('messaging.message_id', saved.id);

          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);

          await this.rabbitmqService.publish(
            RabbitmqService.QUEUE,
            { id: saved.id, content: saved.content },
            headers,
          );

          return saved;
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
