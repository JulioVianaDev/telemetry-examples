import { LoggerService as NestLoggerService } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

export class OtelLoggerService implements NestLoggerService {
  private readonly logger = logs.getLogger('nestjs');

  log(message: string, context?: string) {
    this.emit(SeverityNumber.INFO, message, context);
    console.log(this.format('LOG', message, context));
  }

  error(message: string, trace?: string, context?: string) {
    this.emit(SeverityNumber.ERROR, message, context, trace);
    console.error(this.format('ERROR', message, context));
    if (trace) console.error(trace);
  }

  warn(message: string, context?: string) {
    this.emit(SeverityNumber.WARN, message, context);
    console.warn(this.format('WARN', message, context));
  }

  debug(message: string, context?: string) {
    this.emit(SeverityNumber.DEBUG, message, context);
    console.debug(this.format('DEBUG', message, context));
  }

  verbose(message: string, context?: string) {
    this.emit(SeverityNumber.TRACE, message, context);
    console.log(this.format('VERBOSE', message, context));
  }

  private emit(
    severityNumber: SeverityNumber,
    message: string,
    context?: string,
    trace?: string,
  ) {
    this.logger.emit({
      severityNumber,
      severityText: SeverityNumber[severityNumber],
      body: message,
      attributes: {
        ...(context ? { 'nestjs.context': context } : {}),
        ...(trace ? { 'exception.stacktrace': trace } : {}),
      },
    });
  }

  private format(level: string, message: string, context?: string): string {
    const ctx = context ? `[${context}] ` : '';
    return `${ctx}${level} - ${message}`;
  }
}
