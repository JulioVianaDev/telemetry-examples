import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { MessageModule } from './message/message.module';
import { Message } from './message/message.entity';
import { MessageStats } from './message/message-stats.entity';
import { UsersController } from './users.controller';
import { RedisCacheModule } from './redis/redis-cache.module';
import { ElasticSearchModule } from './elasticsearch/elasticsearch.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'guest',
      password: process.env.DB_PASS || 'guest',
      database: process.env.DB_NAME || 'backend',
      entities: [Message, MessageStats],
      migrations: ['dist/migrations/*.js'],
      migrationsRun: true,
      synchronize: false,
      ssl: false,
      extra: {
        // Keep idle connections alive so Docker/OS doesn't kill them
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // Pool sizing
        max: 20,
        min: 2,
        // Kill idle connections after 30s to avoid stale sockets
        idleTimeoutMillis: 30000,
        // Timeout waiting for a connection from the pool
        connectionTimeoutMillis: 5000,
      },
      retryAttempts: 5,
      retryDelay: 3000,
    }),
    RabbitmqModule,
    RedisCacheModule,
    ElasticSearchModule,
    MessageModule,
  ],
  controllers: [AppController, UsersController],
  providers: [AppService],
})
export class AppModule { }
