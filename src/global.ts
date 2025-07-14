import otel from '@opentelemetry/api';
import type { Config } from './types.ts';
import { BatchTracedSpanProcessor } from '@esroyo/otel-batch-traced-span-processor';
import { ServerTimingSpanExporter } from '@esroyo/otel-server-timing-span-exporter';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { Resource } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
    MeterProvider,
    PeriodicExportingMetricReader,
    View,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { loadSync as dotenvLoad } from '@std/dotenv';
import { CustomTracerProvider } from './custom-tracer-provider.ts';
import { CustomOTLPTraceExporter } from './custom-otlp-trace-exporter.ts';
import { sanitizeBasePath, sanitizeUpstreamOrigin } from './utils.ts';
import { MaxAggregation, MinAggregation } from './max-min-aggregation.ts';

globalThis.addEventListener('unhandledrejection', (event) => {
    console.error(
        new AggregateError([event.reason], 'Unhandled promise rejection'),
    );
    event.preventDefault();
});

// Step: resolve config
dotenvLoad({ export: true });

export const config: Config = {
    BASE_PATH: sanitizeBasePath(Deno.env.get('BASE_PATH') ?? '/'),
    CACHE_CLIENT_REDIRECT:
        Number(Deno.env.get('CACHE_CLIENT_REDIRECT') as string) || 600,
    CACHE_ENABLE: Deno.env.get('CACHE_ENABLE') === 'true',
    CACHE_IGNORE_SEARCH: Deno.env.get('CACHE_IGNORE_SEARCH') !== 'false', // default true
    CACHE_INSTRUMENTATION: Deno.env.get('CACHE_INSTRUMENTATION') !== 'false', // default true
    CACHE_CONN_MAX: Number(Deno.env.get('CACHE_CONN_MAX')) || 20,
    CACHE_CONN_MIN: Number(Deno.env.get('CACHE_CONN_MIN')) || 2,
    CACHE_NAME: Deno.env.get('CACHE_NAME') ?? 'v1',
    CACHE_REDIRECT: Number(Deno.env.get('CACHE_REDIRECT') as string) || 600,
    CACHE_REDIS_HOSTNAME: Deno.env.get('CACHE_REDIS_HOSTNAME') ?? '',
    CACHE_REDIS_USERNAME: Deno.env.get('CACHE_REDIS_USERNAME') ?? '',
    CACHE_REDIS_PORT: Deno.env.get('CACHE_REDIS_PORT') ?? '6379',
    CACHE_REDIS_PASSWORD: Deno.env.get('CACHE_REDIS_PASSWORD') ?? '',
    CACHE_REDIS_TLS: Deno.env.get('CACHE_REDIS_TLS') === 'true', // default false
    DEPLOYMENT_TAG: Deno.env.get('DEPLOYMENT_TAG'),
    ENV: Deno.env.get('ENV') ?? 'dev',
    OTEL_EXPORTER_ENABLE: Deno.env.get('OTEL_EXPORTER_ENABLE') === 'true', // default false
    OTEL_EXPORTER_OTLP_ENDPOINT: Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT') ??
        `http://${Deno.env.get('DD_AGENT_HOST') ?? 'localhost'}:4318`,
    OTEL_EXPORTER_OTLP_HEADERS: JSON.parse(
        Deno.env.get('OTEL_EXPORTER_OTLP_HEADERS') ?? '{}',
    ),
    HOMEPAGE: Deno.env.get('HOMEPAGE') ?? '',
    OUTPUT_BANNER: Deno.env.get('OUTPUT_BANNER') ?? '',
    REDIRECT_FASTPATH: Deno.env.get('REDIRECT_FASTPATH') !== 'false', // default true
    ROLLUP_PLUGIN: (Deno.env.get('ROLLUP_PLUGIN') ?? '').split('\\n').filter(
        Boolean,
    ),
    SERVICE_NAME: Deno.env.get('SERVICE_NAME') ?? 'systemjs',
    SERVICE_INSTANCE_ID: Deno.env.get('SERVICE_INSTANCE_ID'),
    UPSTREAM_ORIGIN: sanitizeUpstreamOrigin(
        Deno.env.get('UPSTREAM_ORIGIN') ?? 'https://esm.sh',
    ),
    UPSTREAM_TIMEOUT: Number(Deno.env.get('UPSTREAM_TIMEOUT')) || 60_000,
    WORKER_ENABLE: Deno.env.get('WORKER_ENABLE') === 'true' && // default to false
        typeof Worker !== 'undefined',
    WORKER_MAX: Number(Deno.env.get('WORKER_MAX')) || 4,
    WORKER_MIN: Number(Deno.env.get('WORKER_MIN')) || 2,
};

const isMainProcess = 'Window' in globalThis;

if (isMainProcess) {
    console.log(`Config:`, config);
}

// Step: minimal tracing setup
const resource = new Resource({
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.ENV,
    [SemanticResourceAttributes.SERVICE_NAME]: config.SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.DEPLOYMENT_TAG,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]:
        config.SERVICE_INSTANCE_ID,
    [SemanticResourceAttributes.TELEMETRY_SDK_LANGUAGE]: 'javascript',
});
const provider = new CustomTracerProvider({ resource });
provider.addSpanProcessor(
    new SimpleSpanProcessor(new ServerTimingSpanExporter()),
);
provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
});

// Step: OTLP tracing setup
if (config.OTEL_EXPORTER_ENABLE) {
    const traceCollectorOptions = {
        // url is optional and can be omitted - default is http://localhost:4318
        url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
        // an optional object containing custom headers to be sent with each request will only work with http
        headers: config.OTEL_EXPORTER_OTLP_HEADERS,
        // an optional limit on pending requests
        concurrencyLimit: 10,
    };
    const otlpExporter = new CustomOTLPTraceExporter(traceCollectorOptions);
    const otelProcessor = new BatchTracedSpanProcessor(otlpExporter);
    provider.addSpanProcessor(otelProcessor);
    const metricsCollectorOptions = {
        // url is optional and can be omitted - default is http://localhost:4318
        url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
        // an optional object containing custom headers to be sent with each request will only work with http
        headers: config.OTEL_EXPORTER_OTLP_HEADERS,
        // an optional limit on pending requests
        concurrencyLimit: 10,
    };
    const metricExporter = new OTLPMetricExporter(metricsCollectorOptions);
    const meterProvider = new MeterProvider({
        resource,
        readers: [
            new PeriodicExportingMetricReader({
                exporter: metricExporter,
                exportIntervalMillis: 1000,
            }),
        ],
        views: [
            new View({
                aggregation: new MinAggregation(),
                instrumentName: 'app.workers.available',
            }),
            new View({
                aggregation: new MaxAggregation(),
                instrumentName: 'app.workers.pending',
            }),
            new View({
                aggregation: new MaxAggregation(),
                instrumentName: 'app.workers.borrowed',
            }),
        ],
    });
    // Registration
    otel.metrics.setGlobalMeterProvider(meterProvider);

    if (isMainProcess) {
        console.log('OTLP options:', {
            traceCollectorOptions,
            metricsCollectorOptions,
        });
    }
}

// Initial import of the configured Rollup plugins, if any
if (config.ROLLUP_PLUGIN?.length) {
    await Promise.all(config.ROLLUP_PLUGIN.map((plugin) => {
        const idx = plugin.indexOf('=');
        const pkgName = idx === -1 ? plugin : plugin.slice(0, idx);
        // Rollup is nodejs specific (uses require), so we asume plugin is found on NPM
        return import(`npm:${pkgName}`);
    }));
}
