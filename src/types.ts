import type { ExistingRawSourceMap, InputOptions, OutputOptions } from 'rollup';
import opentelemetry from '@opentelemetry/api';
import type { ServerTimingSpanExporter } from '@esroyo/otel-server-timing-span-exporter';

export type Config = {
    BASE_PATH: string;
    CACHE_BULK_LIMIT?: number;
    CACHE_CONN_MAX?: number;
    CACHE_CONN_MIN?: number;
    CACHE_CLIENT_REDIRECT?: number;
    CACHE_ENABLE: boolean;
    CACHE_INSTRUMENTATION?: boolean;
    CACHE_IGNORE_SEARCH?: boolean;
    CACHE_NAME: string;
    CACHE_REDIRECT?: number;
    CACHE_REDIS_HOSTNAME?: string;
    CACHE_REDIS_PORT?: string;
    CACHE_REDIS_USERNAME?: string;
    CACHE_REDIS_PASSWORD?: string;
    CACHE_REDIS_TLS?: boolean;
    DEPLOYMENT_TAG?: string;
    ENV?: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    OTEL_EXPORTER_ENABLE?: boolean;
    OTEL_EXPORTER_OTLP_HEADERS?: Record<string, string>;
    HOMEPAGE: string;
    OUTPUT_BANNER?: string;
    REDIRECT_FASTPATH?: boolean;
    ROLLUP_PLUGIN?: string[];
    SERVICE_NAME?: string;
    SERVICE_INSTANCE_ID?: string;
    UPSTREAM_ORIGIN: string;
    UPSTREAM_TIMEOUT?: number;
    WORKER_ENABLE?: boolean;
    WORKER_MAX?: number;
    WORKER_MIN?: number;
};

export type OpenTelemetry = typeof opentelemetry;

export type PartialServerTimingSpanExporter = Pick<
    ServerTimingSpanExporter,
    'getServerTimingHeader'
>;

export interface SourceDescription {
    code: string;
    map?: string | ExistingRawSourceMap;
}

export interface RollupVirtualOptions {
    [id: string]: string | SourceDescription;
}

export type SourceModule = SourceDescription & { name: string };

export type BuildResult = {
    code: string;
    map?: string;
};

export interface RollupOptions extends InputOptions {
    // This is included for compatibility with config files but ignored by rollup.rollup
    output?: OutputOptions;
    plugin?: string[];
}

export type Fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>;
