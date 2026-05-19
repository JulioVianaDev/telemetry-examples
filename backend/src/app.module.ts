import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { MessageModule } from './message/message.module';
import { Message } from './message/message.entity';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'guest',
      password: process.env.DB_PASS || 'guest',
      database: process.env.DB_NAME || 'backend',
      entities: [Message],
      migrations: ['dist/migrations/*.js'],
      migrationsRun: true,
      synchronize: false,
      ssl: false,
    }),
    RabbitmqModule,
    MessageModule,
  ],
  controllers: [AppController, UsersController],
  providers: [AppService],
})
export class AppModule {}
