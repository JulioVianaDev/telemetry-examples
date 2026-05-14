import {
  ValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export class TracingValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const tracer = trace.getTracer('dto-validation');
        const activeSpan = trace.getActiveSpan();

        const validationDetails = errors.map((error) => ({
          field: error.property,
          value: error.value,
          constraints: error.constraints,
        }));

        tracer.startActiveSpan('DTO Validation Failed', (span) => {
          span.setAttributes({
            'dto.validation.success': false,
            'dto.validation.error_count': errors.length,
            'dto.validation.errors': JSON.stringify(validationDetails),
          });

          for (const error of errors) {
            const constraints = error.constraints
              ? Object.values(error.constraints)
              : [];

            span.addEvent('validation.error', {
              'dto.field': error.property,
              'dto.value': String(error.value ?? 'undefined'),
              'dto.reasons': constraints.join('; '),
            });
          }

          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'DTO validation failed',
          });
          span.end();
        });

        if (activeSpan) {
          activeSpan.setAttributes({
            'dto.validation.success': false,
            'dto.validation.error_count': errors.length,
          });
          activeSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Request blocked by DTO validation',
          });
        }

        const messages = errors.flatMap((error) =>
          error.constraints ? Object.values(error.constraints) : [],
        );

        return new BadRequestException({
          statusCode: 400,
          message: messages,
          error: 'DTO Validation Failed',
        });
      },
    });
  }
}
