import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import {
  SimpleLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import { IncomingMessage } from 'http';
import { resolveUser } from './users.mock';

const exporterUrl =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4317';
const serviceName = process.env.SERVICE_NAME || 'backend-nestjs';

// ─── Prometheus direct scrape endpoint (port 3001) ───
const prometheusExporter = new PrometheusExporter({ port: 6666 }, () => {
  console.log(`[Metrics] Prometheus scrape endpoint on :6666/metrics`);
});

// ─── OTLP metric exporter (push to collector -> Prometheus remote write) ───
const otlpMetricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({ url: exporterUrl }),
  exportIntervalMillis: 15000,
});

// ─── OTLP log exporter (push to collector -> Loki) ───
const logExporter = new OTLPLogExporter({ url: exporterUrl });
const logRecordProcessor = new SimpleLogRecordProcessor(logExporter);
const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  processors: [logRecordProcessor],
});
logs.setGlobalLoggerProvider(loggerProvider);

// ─── MeterProvider with both readers (OTLP push + Prometheus scrape) ───
const meterProvider = new MeterProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  readers: [otlpMetricReader, prometheusExporter],
});
metrics.setGlobalMeterProvider(meterProvider);

// ─── Main SDK (traces + logs — metrics handled above) ───
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-pg': { enabled: false },
      // Disable bundled ioredis — we register a separate provider below
      '@opentelemetry/instrumentation-ioredis': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => {
          // Ignore Prometheus scrape requests — they pollute span metrics
          // with empty http.route and no tenant context
          const url = request.url ?? '';
          return url === '/metrics' || url.startsWith('/metrics?');
        },
        requestHook: (span, request) => {
          const req = request as IncomingMessage;
          span.setAttribute('span.source', 'http');
          const userId = req.headers['x-user-id'] as string | undefined;
          const user = resolveUser(userId);
          if (user) {
            span.setAttribute('user.id', user.id);
            span.setAttribute('user.name', user.name);
            if (user.tenantId) {
              span.setAttribute('tenant.id', user.tenantId);
            }
          }
        },
      },
    }),
  ],
  traceExporter: new OTLPTraceExporter({ url: exporterUrl }),
  logRecordProcessors: [new SimpleLogRecordProcessor(logExporter)],
});

sdk.start();

// ─── Separate PG instrumentation with its own provider ───
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

// ─── Separate IORedis instrumentation with its own provider ───
const redisProvider = new BasicTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'redis-query',
  }),
  spanProcessors: [
    new SimpleSpanProcessor(new OTLPTraceExporter({ url: exporterUrl })),
  ],
});

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation({
      dbStatementSerializer: (cmdName, cmdArgs) => {
        const args = cmdArgs
          .map((a) =>
            typeof a === 'string' && a.length > 100
              ? a.substring(0, 100) + '...'
              : a,
          )
          .join(' ');
        return `${cmdName} ${args}`.trim();
      },
    }),
  ],
  tracerProvider: redisProvider,
});

console.log(`[Telemetry] initialized for service "${serviceName}"`);
console.log(`[Telemetry] traces  -> ${exporterUrl} -> Tempo`);
console.log(`[Telemetry] metrics -> ${exporterUrl} -> Prometheus`);
console.log(`[Telemetry] logs    -> ${exporterUrl} -> Loki`);
console.log(`[Telemetry] pg queries will appear as "pg-query"`);
console.log(`[Telemetry] redis commands will appear as "redis-query"`);

process.on('SIGTERM', () => {
  Promise.all([sdk.shutdown(), loggerProvider.shutdown(), meterProvider.shutdown()])
    .then(() => console.log('[Telemetry] terminated'))
    .catch((err) => console.error('[Telemetry] error shutting down', err))
    .finally(() => process.exit(0));
});
