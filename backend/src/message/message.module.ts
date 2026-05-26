import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { MessageStats } from './message-stats.entity';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageConsumer } from './message.consumer';
import { MessageCronService } from './message-cron.service';
import { HealthCronService } from './health-cron.service';
import { StatsConsumer } from './stats.consumer';
import { ConsoleService } from './console.service';
import { DelayService } from './delay.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, MessageStats])],
  controllers: [MessageController],
  providers: [MessageService, MessageConsumer, MessageCronService, HealthCronService, StatsConsumer, ConsoleService, DelayService],
})
export class MessageModule { }
