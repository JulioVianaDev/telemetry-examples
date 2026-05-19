import { Controller, Get } from '@nestjs/common';
import { MOCK_USERS } from './users.mock';

@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return MOCK_USERS;
  }
}
