import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
const serviceName = process.env.SERVICE_NAME || 'backend-nestjs';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-pg': { enabled: false },
    }),
  ],
  traceExporter: new OTLPTraceExporter({ url: exporterUrl }),
});

sdk.start();

const pgProvider = new BasicTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'pg-query',
  }),
  spanProcessors: [
    new SimpleSpanProcessor(new OTLPTraceExporter({ url: exporterUrl })),
  ],
});

registerInstrumentations({
  instrumentations: [new PgInstrumentation()],
  tracerProvider: pgProvider,
});

console.log(`[Tracing] initialized for service "${serviceName}"`);
console.log(`[Tracing] pg queries will appear as "pg-query"`);

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('[Tracing] terminated'))
    .catch((err) => console.error('[Tracing] error shutting down', err))
    .finally(() => process.exit(0));
});
