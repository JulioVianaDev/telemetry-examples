import './tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const port = process.env.PORT ?? 3333;
  await app.listen(port);
  console.log(`[Backend] Running on port ${port}`);
}
bootstrap();
