import './tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OtelLoggerService } from './otel-logger.service';
import { TracingValidationPipe } from './tracing-validation.pipe';
import { TracingExceptionFilter } from './tracing-exception.filter';
import { HttpContextInterceptor } from './http-context.interceptor';

async function bootstrap() {
  const otelLogger = new OtelLoggerService();
  const app = await NestFactory.create(AppModule, { logger: otelLogger });
  app.enableCors();
  app.useGlobalInterceptors(new HttpContextInterceptor());
  app.useGlobalFilters(new TracingExceptionFilter());
  app.useGlobalPipes(new TracingValidationPipe());
  const port = process.env.PORT ?? 3333;
  await app.listen(port);
  console.log(`[Backend] Running on port ${port}`);
}
bootstrap();
