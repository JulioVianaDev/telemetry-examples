import { Body, Controller, Post } from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './create-message.dto';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(@Body() dto: CreateMessageDto) {
    return this.messageService.create(dto);
  }
}
