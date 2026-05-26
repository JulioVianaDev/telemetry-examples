import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  static readonly QUEUE = 'messages';
  static readonly UPDATES_QUEUE = 'message-updates';
  static readonly STATS_QUEUE = 'message-stats';

  private get url(): string {
    const host = process.env.RABBITMQ_HOST || '127.0.0.1';
    const user = process.env.RABBITMQ_USER || 'guest';
    const pass = process.env.RABBITMQ_PASS || 'guest';
    return `amqp://${user}:${pass}@${host}`;
  }

  async onModuleInit() {
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();
        await this.channel!.assertQueue(RabbitmqService.QUEUE, { durable: true });
        await this.channel!.assertQueue(RabbitmqService.UPDATES_QUEUE, { durable: true });
        await this.channel!.assertQueue(RabbitmqService.STATS_QUEUE, { durable: true });
        this.logger.log('Connected');
        return;
      } catch (err) {
        this.logger.warn(`Connection attempt ${attempt}/${maxRetries} failed, retrying in 3s...`);
        if (attempt === maxRetries) throw err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(
    queue: string,
    data: unknown,
    headers?: Record<string, string>,
  ): Promise<void> {
    this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
      persistent: true,
      headers,
    });
  }

  async healthCheck(): Promise<{ connected: boolean; queues: number }> {
    if (!this.channel) {
      return { connected: false, queues: 0 };
    }
    try {
      // assertQueue on an existing queue is idempotent and confirms the broker is reachable
      const result = await this.channel.assertQueue(RabbitmqService.QUEUE, { durable: true });
      return { connected: true, queues: result.messageCount };
    } catch {
      return { connected: false, queues: 0 };
    }
  }

  async consume(
    queue: string,
    handler: (msg: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    await this.channel!.consume(queue, async (msg) => {
      if (msg) {
        await handler(msg);
        this.channel!.ack(msg);
      }
    });
  }
}
