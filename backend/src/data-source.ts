import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Message } from './message/message.entity';
import { MessageStats } from './message/message-stats.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'guest',
  password: process.env.DB_PASS || 'guest',
  database: process.env.DB_NAME || 'backend',
  ssl: false,
  entities: [Message, MessageStats],
  migrations: ['dist/migrations/*.js'],
  extra: {
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 5000,
  },
  connectTimeoutMS: 10000,
});
