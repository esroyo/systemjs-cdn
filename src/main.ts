import type { Config } from './types.ts';
import {
    AsyncLocalStorageContextManager,
    BasicTracerProvider,
    BatchTracedSpanProcessor,
    // ConsoleSpanExporter,
    dotenvLoad,
    OTLPTraceExporter,
    redis,
    Resource,
    SemanticResourceAttributes,
    serve,
    ServerTimingSpanExporter,
    SimpleSpanProcessor,
} from '../deps.ts';
import { DenoKvCache } from './cache/deno-kv-cache.ts';
import { RedisCache } from './cache/redis-cache.ts';
import { createRequestHandler } from './create-request-handler.ts';
import { instrumentRequestHandler } from './instrument-request-handler.ts';
import { sanitizeBasePath, sanitizeUpstreamOrigin } from './utils.ts';

// Step: resolve config
dotenvLoad({ export: true });

const config: Config = {
    BASE_PATH: sanitizeBasePath(Deno.env.get('BASE_PATH')),
    CACHE: Deno.env.get('CACHE') === 'true',
    CACHE_REDIRECT: Number(Deno.env.get('CACHE_REDIRECT') as string) || 0,
    CACHE_CLIENT_REDIRECT:
        Number(Deno.env.get('CACHE_CLIENT_REDIRECT') as string) || 0,
    CACHE_REDIS_HOSTNAME: Deno.env.get('CACHE_REDIS_HOSTNAME') ?? '',
    DD_TRACE_ENABLED: Deno.env.get('DD_TRACE_ENABLED') !== 'false',
    HOMEPAGE: Deno.env.get('HOMEPAGE') ?? '',
    OUTPUT_BANNER: Deno.env.get('OUTPUT_BANNER') ?? '',
    REDIRECT_FASTPATH: Deno.env.get('REDIRECT_FASTPATH') === 'true',
    UPSTREAM_ORIGIN: sanitizeUpstreamOrigin(Deno.env.get('UPSTREAM_ORIGIN')),
    WORKER_ENABLE: Deno.env.get('WORKER_ENABLE') === 'true',
};
console.log('Config:', config);

// Step: minimal tracing setup
const provider = new BasicTracerProvider({
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
const serverTimingExporter = new ServerTimingSpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(serverTimingExporter));
// provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

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
    const otlpExporter = new OTLPTraceExporter(collectorOptions);
    const otelProcessor = new BatchTracedSpanProcessor(otlpExporter);
    provider.addSpanProcessor(otelProcessor);
    console.log('OTLP options:', collectorOptions);
}

// Step: cache service
const cache = config.CACHE_REDIS_HOSTNAME
    ? new RedisCache(
        redis.createLazyClient({ hostname: config.CACHE_REDIS_HOSTNAME }),
    )
    : new DenoKvCache();

serve(
    instrumentRequestHandler(createRequestHandler(config, cache)),
    { port: 8000 },
);
