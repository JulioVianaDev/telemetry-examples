import { ConsoleLogger } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

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
    const context = this.extractContext(optionalParams);
    this.otelLogger.emit({
      severityNumber: severity,
      severityText: SeverityNumber[severity],
      body: typeof message === 'string' ? message : JSON.stringify(message),
      attributes: {
        ...(context ? { 'nestjs.context': context } : {}),
        ...(stack ? { 'exception.stacktrace': stack } : {}),
      },
    });
  }

  private extractContext(optionalParams: any[]): string | undefined {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === 'string' ? last : this.context;
  }
}
