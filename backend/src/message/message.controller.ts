import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './create-message.dto';
import { UpdateMessageDto } from './update-message.dto';
import { QueryMessageDto } from './query-message.dto';
import { ElasticsearchLogService } from '../elasticsearch/elasticsearch-log.service';

@Controller('messages')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly esLogService: ElasticsearchLogService,
  ) {}

  @Post()
  create(@Body() dto: CreateMessageDto) {
    return this.messageService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryMessageDto) {
    return this.messageService.findAll(query);
  }

  @Get('logs')
  searchLogs(
    @Query('term') term: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    return this.esLogService.search(term || '*', {
      from: from ? parseInt(from, 10) : 0,
      size: size ? parseInt(size, 10) : 20,
    });
  }

  @Get('test/error')
  testError(@Query('type') type?: string) {
    return this.messageService.simulateError(type);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.messageService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messageService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.messageService.remove(id);
  }
}
