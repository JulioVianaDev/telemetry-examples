import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageConsumer } from './message.consumer';
import { ConsoleService } from './console.service';
import { DelayService } from './delay.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  controllers: [MessageController],
  providers: [MessageService, MessageConsumer, ConsoleService, DelayService],
})
export class MessageModule { }
