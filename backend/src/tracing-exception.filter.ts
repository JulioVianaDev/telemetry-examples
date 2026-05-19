import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { httpContextStorage } from './http-context.interceptor';

@Catch()
export class TracingExceptionFilter implements ExceptionFilter {
  private readonly otelLogger = logs.getLogger('nestjs');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : 'Internal server error';

    const errorType = isHttpException
      ? exception.name
      : (exception as Error)?.constructor?.name || 'UnknownError';
    const errorMessage = typeof exceptionResponse === 'string'
      ? exceptionResponse
      : JSON.stringify(exceptionResponse);

    const tenantId = request.tenantId as string | undefined;

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'http.status_code': status,
        'http.method': request.method,
        'http.route': request.route?.path || request.url,
        'error.type': errorType,
        'error.message': errorMessage,
      });

      if (tenantId) {
        activeSpan.setAttribute('tenant.id', tenantId);
      }

      if (exception instanceof Error) {
        activeSpan.setAttribute('error.stack', exception.stack || '');
      }

      activeSpan.recordException(exception instanceof Error
        ? exception
        : new Error(String(exception)),
      );

      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${status}`,
      });
    }

    // Log real errors (not DTO/validation 400s) directly to OTel so they appear in Loki
    if ( status != 400) {
      const route = request.route?.path
        ? request.baseUrl + request.route.path
        : request.url;
      const activeContext = context.active();
      const spanContext = trace.getSpanContext(activeContext);
      const httpCtx = httpContextStorage.getStore();
      const message = exception instanceof Error
        ? exception.message
        : String(exception);

      this.otelLogger.emit({
        context: activeContext,
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: `${errorType}: ${message}`,
        attributes: {
          'nestjs.context': 'ExceptionFilter',
          'error.type': errorType,
          'error.status': status,
          ...(spanContext?.traceId ? { traceId: spanContext.traceId } : {}),
          ...(spanContext?.spanId ? { spanId: spanContext.spanId } : {}),
          http_method: httpCtx?.method ?? request.method,
          http_route: httpCtx?.route ?? route,
          ...(httpCtx?.tenantId ? { tenant_id: httpCtx.tenantId } : {}),
          ...(httpCtx?.userId ? { user_id: httpCtx.userId } : {}),
        },
      });
    }

    const body = typeof exceptionResponse === 'string'
      ? { statusCode: status, message: exceptionResponse, error: (exception as Error)?.constructor?.name || 'Error' }
      : exceptionResponse;

    response.status(status).json(body);
  }
}
