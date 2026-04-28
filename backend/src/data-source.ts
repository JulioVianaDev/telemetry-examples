import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Message } from './message/message.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'guest',
  password: process.env.DB_PASS || 'guest',
  database: process.env.DB_NAME || 'backend',
  ssl: false,
  entities: [Message],
  migrations: ['dist/migrations/*.js'],
});
