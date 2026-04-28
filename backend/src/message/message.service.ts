import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { context, propagation } from '@opentelemetry/api';
import { Message } from './message.entity';
import { CreateMessageDto } from './create-message.dto';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async create(dto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepo.create({
      content: dto.content,
      status: 'pending',
    });
    const saved = await this.messageRepo.save(message);

    // random delay 0-50ms
    const delay = Math.floor(Math.random() * 51);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);

    await this.rabbitmqService.publish(
      RabbitmqService.QUEUE,
      { id: saved.id, content: saved.content },
      headers,
    );

    return saved;
  }
}
