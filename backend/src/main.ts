import './tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OtelLoggerService } from './otel-logger.service';
import { TracingValidationPipe } from './tracing-validation.pipe';
import { TracingExceptionFilter } from './tracing-exception.filter';
import { TenantInterceptor } from './tenant.interceptor';
import { HttpContextInterceptor } from './http-context.interceptor';

async function bootstrap() {
  const otelLogger = new OtelLoggerService();
  const app = await NestFactory.create(AppModule, { logger: otelLogger });
  app.enableCors();
  // TenantInterceptor runs first to resolve user/tenantId on the request,
  // then HttpContextInterceptor captures it into AsyncLocalStorage
  app.useGlobalInterceptors(
    new TenantInterceptor(),
    new HttpContextInterceptor(),
  );
  app.useGlobalFilters(new TracingExceptionFilter());
  app.useGlobalPipes(new TracingValidationPipe());
  const port = process.env.PORT ?? 3333;
  await app.listen(port);
  console.log(`[Backend] Running on port ${port}`);
}
bootstrap();
