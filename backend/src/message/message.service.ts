import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { context, propagation, trace, SpanKind } from '@opentelemetry/api';
import { Message } from './message.entity';
import { CreateMessageDto } from './create-message.dto';
import { UpdateMessageDto } from './update-message.dto';
import { QueryMessageDto } from './query-message.dto';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { ConsoleService } from './console.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
    private readonly consoleService: ConsoleService,
  ) {}

  async create(dto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepo.create({
      content: dto.content,
      tenantId: dto.tenantId,
      status: 'pending',
    });
    const saved = await this.messageRepo.save(message);

    const tracer = trace.getTracer('message-service');
    this.consoleService.log('Creating message');
    // random delay 0-50ms
    const delay = Math.floor(Math.random() * 51);
    await tracer.startActiveSpan('random timeout', async (timeoutSpan) => {
      timeoutSpan.setAttribute('delay.ms', delay);
      timeoutSpan.setAttribute('tenant.id', dto.tenantId);
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
          span.setAttribute('tenant.id', saved.tenantId);

          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);

          await this.rabbitmqService.publish(
            RabbitmqService.QUEUE,
            { id: saved.id, content: saved.content, tenantId: saved.tenantId },
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

  async findAll(
    query: QueryMessageDto,
  ): Promise<{ data: Message[]; count: number }> {
    const tracer = trace.getTracer('message-service');
    return await tracer.startActiveSpan('findAll messages', async (span) => {
      try {
        const where: Record<string, unknown> = {};
        if (query.tenantId) {
          where.tenantId = query.tenantId;
          span.setAttribute('query.tenantId', query.tenantId);
          span.setAttribute('tenant.id', query.tenantId);
        }
        if (query.status) {
          where.status = query.status;
          span.setAttribute('query.status', query.status);
        }
        if (query.content) {
          where.content = Like(`%${query.content}%`);
          span.setAttribute('query.content', query.content);
        }

        const limit = query.limit ?? 10;
        const offset = query.offset ?? 0;
        span.setAttribute('query.limit', limit);
        span.setAttribute('query.offset', offset);

        const [data, count] = await this.messageRepo.findAndCount({
          where,
          take: limit,
          skip: offset,
          order: { createdAt: 'DESC' },
        });

        span.setAttribute('result.count', count);
        span.setAttribute('result.returned', data.length);
        return { data, count };
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async findOne(id: string): Promise<Message> {
    const tracer = trace.getTracer('message-service');
    return await tracer.startActiveSpan('findOne message', async (span) => {
      try {
        span.setAttribute('message.id', id);
        const message = await this.messageRepo.findOneBy({ id });
        if (!message) {
          span.setAttribute('message.found', false);
          throw new NotFoundException(`Message ${id} not found`);
        }
        span.setAttribute('message.found', true);
        span.setAttribute('message.status', message.status);
        span.setAttribute('tenant.id', message.tenantId);
        return message;
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async update(id: string, dto: UpdateMessageDto): Promise<Message> {
    const tracer = trace.getTracer('message-service');

    const message = await this.messageRepo.findOneBy({ id });
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }

    message.content = dto.content;
    message.status = 'pending';
    const saved = await this.messageRepo.save(message);

    this.consoleService.log('Updating message');
    // random delay 0-50ms
    const delay = Math.floor(Math.random() * 51);
    await tracer.startActiveSpan('random timeout', async (timeoutSpan) => {
      timeoutSpan.setAttribute('delay.ms', delay);
      timeoutSpan.setAttribute('tenant.id', saved.tenantId);
      await new Promise((resolve) => setTimeout(resolve, delay));
      timeoutSpan.end();
    });

    return await tracer.startActiveSpan(
      'send update to queue',
      { kind: SpanKind.PRODUCER },
      async (span) => {
        try {
          span.setAttribute('messaging.system', 'rabbitmq');
          span.setAttribute(
            'messaging.destination',
            RabbitmqService.UPDATES_QUEUE,
          );
          span.setAttribute('messaging.message_id', saved.id);
          span.setAttribute('messaging.operation', 'update');
          span.setAttribute('tenant.id', saved.tenantId);

          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);

          await this.rabbitmqService.publish(
            RabbitmqService.UPDATES_QUEUE,
            {
              id: saved.id,
              content: saved.content,
              tenantId: saved.tenantId,
              operation: 'update',
            },
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

  async simulateError(type?: string): Promise<void> {
    const tracer = trace.getTracer('message-service');
    await tracer.startActiveSpan('simulateError', async (span) => {
      try {
        span.setAttribute('error.simulation_type', type || 'default');

        switch (type) {
          case 'null': {
            // simulate null pointer like real bug
            const obj: any = null;
            return obj.property.nested;
          }
          case 'undefined': {
            // simulate accessing undefined
            const arr: any[] = [];
            return arr[99].name;
          }
          case 'timeout': {
            await new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Database connection timeout')), 100),
            );
            break;
          }
          case 'db': {
            // simulate a failed DB query
            await this.messageRepo.query('SELECT * FROM table_that_does_not_exist');
            break;
          }
          case 'oom': {
            throw new Error('JavaScript heap out of memory (simulated)');
          }
          case 'type': {
            // simulate type error
            const num: any = 'not a number';
            return num.toFixed(2);
          }
          default: {
            throw new Error('Unexpected internal server error (simulated)');
          }
        }

        throw new Error('Unreachable');
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async remove(id: string): Promise<{ deleted: boolean; id: string }> {
    const tracer = trace.getTracer('message-service');
    return await tracer.startActiveSpan('remove message', async (span) => {
      try {
        span.setAttribute('message.id', id);
        const message = await this.messageRepo.findOneBy({ id });
        if (!message) {
          span.setAttribute('message.found', false);
          throw new NotFoundException(`Message ${id} not found`);
        }
        span.setAttribute('message.found', true);
        span.setAttribute('tenant.id', message.tenantId);
        await this.messageRepo.delete(id);
        return { deleted: true, id };
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
