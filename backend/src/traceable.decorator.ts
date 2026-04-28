import { trace } from '@opentelemetry/api';

export function Traceable(): ClassDecorator {
  return function (target: Function) {
    const prototype = target.prototype;
    const serviceName = target.name;

    const methods = Object.getOwnPropertyNames(prototype).filter(
      (key) => key !== 'constructor' && typeof prototype[key] === 'function',
    );

    for (const method of methods) {
      const original = prototype[method];

      prototype[method] = function (...args: unknown[]) {
        const tracer = trace.getTracer(serviceName);
        return tracer.startActiveSpan(
          `${serviceName}.${method}`,
          (span) => {
            try {
              const result = original.apply(this, args);
              if (result instanceof Promise) {
                return result
                  .then((value: unknown) => {
                    span.end();
                    return value;
                  })
                  .catch((err: Error) => {
                    span.recordException(err);
                    span.end();
                    throw err;
                  });
              }
              span.end();
              return result;
            } catch (err) {
              span.recordException(err as Error);
              span.end();
              throw err;
            }
          },
        );
      };
    }
  };
}
