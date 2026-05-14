import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Catch()
export class TracingExceptionFilter implements ExceptionFilter {
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

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'http.status_code': status,
        'http.method': request.method,
        'http.route': request.route?.path || request.url,
        'error.type': isHttpException
          ? exception.name
          : (exception as Error)?.constructor?.name || 'UnknownError',
        'error.message': typeof exceptionResponse === 'string'
          ? exceptionResponse
          : JSON.stringify(exceptionResponse),
      });

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

    const body = typeof exceptionResponse === 'string'
      ? { statusCode: status, message: exceptionResponse, error: (exception as Error)?.constructor?.name || 'Error' }
      : exceptionResponse;

    response.status(status).json(body);
  }
}
