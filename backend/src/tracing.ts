import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const serviceName = process.env.SERVICE_NAME || 'backend-nestjs';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  }),
});

sdk.start();
console.log(`[Tracing] initialized for service "${serviceName}"`);

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('[Tracing] terminated'))
    .catch((err) => console.error('[Tracing] error shutting down', err))
    .finally(() => process.exit(0));
});
