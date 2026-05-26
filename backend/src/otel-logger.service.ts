import { ConsoleLogger } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { httpContextStorage } from './http-context.interceptor';

export class OtelLoggerService extends ConsoleLogger {
  private readonly otelLogger = logs.getLogger('nestjs');

  log(message: any, ...optionalParams: any[]) {
    super.log(message, ...optionalParams);
    this.emitOtel(SeverityNumber.INFO, message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    super.error(message, ...optionalParams);
    const stack =
      typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    this.emitOtel(SeverityNumber.ERROR, message, optionalParams, stack);
  }

  warn(message: any, ...optionalParams: any[]) {
    super.warn(message, ...optionalParams);
    this.emitOtel(SeverityNumber.WARN, message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    super.debug(message, ...optionalParams);
    this.emitOtel(SeverityNumber.DEBUG, message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    super.verbose(message, ...optionalParams);
    this.emitOtel(SeverityNumber.TRACE, message, optionalParams);
  }

  fatal(message: any, ...optionalParams: any[]) {
    super.fatal(message, ...optionalParams);
    this.emitOtel(SeverityNumber.FATAL, message, optionalParams);
  }

  private emitOtel(
    severity: SeverityNumber,
    message: any,
    optionalParams: any[],
    stack?: string,
  ) {
    const nestCtx = this.extractContext(optionalParams);
    const activeContext = context.active();
    const spanContext = trace.getSpanContext(activeContext);
    const httpCtx = httpContextStorage.getStore();

    // Build attributes from HTTP context OR from the active span attributes
    const attributes: Record<string, string | undefined> = {};

    if (httpCtx) {
      // HTTP request path — context comes from the interceptor
      attributes.span_source = 'http';
      attributes.http_method = httpCtx.method;
      attributes.http_route = httpCtx.route;
      attributes.tenant_id = httpCtx.tenantId;
      attributes.user_id = httpCtx.userId;
    } else {
      // Non-HTTP path (cron, consumer, etc.) — read from the active span
      const activeSpan = trace.getActiveSpan();
      if (activeSpan && 'attributes' in activeSpan) {
        const spanAttrs = (activeSpan as any).attributes;
        if (spanAttrs) {
          attributes.span_source = String(spanAttrs['span.source'] ?? '');
          attributes.tenant_id = String(spanAttrs['tenant.id'] ?? '');
          attributes.user_id = String(spanAttrs['user.id'] ?? '');
          attributes.user_name = String(spanAttrs['user.name'] ?? '');
          attributes.cron_job = String(spanAttrs['cron.job'] ?? '');
        }
      }
    }

    // Clean empty values
    const cleanAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(attributes)) {
      if (v) cleanAttrs[k] = v;
    }

    this.otelLogger.emit({
      context: activeContext,
      severityNumber: severity,
      severityText: SeverityNumber[severity],
      body: typeof message === 'string' ? message : JSON.stringify(message),
      attributes: {
        ...cleanAttrs,
        ...(nestCtx ? { 'nestjs.context': nestCtx } : {}),
        ...(stack ? { 'exception.stacktrace': stack } : {}),
        ...(spanContext?.traceId ? { traceId: spanContext.traceId } : {}),
        ...(spanContext?.spanId ? { spanId: spanContext.spanId } : {}),
      },
    });
  }

  private extractContext(optionalParams: any[]): string | undefined {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === 'string' ? last : this.context;
  }
}
