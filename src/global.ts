import type { Config } from './types.ts';
import { BatchTracedSpanProcessor } from '@esroyo/otel-batch-traced-span-processor';
import { ServerTimingSpanExporter } from '@esroyo/otel-server-timing-span-exporter';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { Resource } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { loadSync as dotenvLoad } from '@std/dotenv';
import { CustomTracerProvider } from './custom-tracer-provider.ts';
import { CustomOTLPTraceExporter } from './custom-otlp-trace-exporter.ts';
import { sanitizeBasePath, sanitizeUpstreamOrigin } from './utils.ts';

// Step: resolve config
dotenvLoad({ export: true });

export const config: Config = {
    BASE_PATH: sanitizeBasePath(Deno.env.get('BASE_PATH') ?? '/'),
    CACHE: Deno.env.get('CACHE') === 'true',
    CACHE_CONN_MAX: Number(Deno.env.get('CACHE_CONN_MAX')) || 20,
    CACHE_CONN_MIN: Number(Deno.env.get('CACHE_CONN_MIN')) || 2,
    CACHE_REDIRECT: Number(Deno.env.get('CACHE_REDIRECT') as string) || 600,
    CACHE_CLIENT_REDIRECT:
        Number(Deno.env.get('CACHE_CLIENT_REDIRECT') as string) || 600,
    CACHE_REDIS_HOSTNAME: Deno.env.get('CACHE_REDIS_HOSTNAME') ?? '',
    DD_TRACE_ENABLED: Deno.env.get('DD_TRACE_ENABLED') === 'true', // default false
    HOMEPAGE: Deno.env.get('HOMEPAGE') ?? '',
    OUTPUT_BANNER: Deno.env.get('OUTPUT_BANNER') ?? '',
    REDIRECT_FASTPATH: Deno.env.get('REDIRECT_FASTPATH') !== 'false', // default true
    UPSTREAM_ORIGIN: sanitizeUpstreamOrigin(
        Deno.env.get('UPSTREAM_ORIGIN') ?? 'https://esm.sh',
    ),
    WORKER_ENABLE: Deno.env.get('WORKER_ENABLE') === 'true', // default false
};

const isMainProcess = 'Window' in globalThis;

if (isMainProcess) {
  console.log(`Config:`, config);
}

// Step: minimal tracing setup
const provider = new CustomTracerProvider({
    resource: new Resource({
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
            Deno.env.get('ENV') ??
                'dev',
        [SemanticResourceAttributes.SERVICE_NAME]: 'systemjs',
        [SemanticResourceAttributes.SERVICE_VERSION]:
            Deno.env.get('DEPLOYMENT_TAG') ?? undefined,
        [SemanticResourceAttributes.TELEMETRY_SDK_LANGUAGE]: 'javascript',
    }),
});
provider.addSpanProcessor(
    new SimpleSpanProcessor(new ServerTimingSpanExporter()),
);
provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
});

// Step: OTLP tracing setup
if (config.DD_TRACE_ENABLED) {
    const collectorOptions = {
        // url is optional and can be omitted - default is http://localhost:4318/v1/traces
        url: `http://${
            Deno.env.get('DD_AGENT_HOST') ?? 'localhost'
        }:4318/v1/traces`,
        // an optional object containing custom headers to be sent with each request will only work with http
        headers: {},
        // an optional limit on pending requests
        concurrencyLimit: 10,
    };
    const otlpExporter = new CustomOTLPTraceExporter(collectorOptions);
    const otelProcessor = new BatchTracedSpanProcessor(otlpExporter);
    provider.addSpanProcessor(otelProcessor);
    if (isMainProcess) {
      console.log('OTLP options:', collectorOptions);
    }
}
