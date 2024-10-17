import { type ExistingRawSourceMap } from 'rollup';
import opentelemetry from '@opentelemetry/api';
import { type ServerTimingSpanExporter } from '@esroyo/otel-server-timing-span-exporter';

export interface HttpZParam {
    name: string;
    value?: string;
}

export interface HttpZBodyParam {
    type?: 'inline' | 'attachment';
    contentType?: string;
    name: string;
    fileName?: string;
}

export interface HttpZBody {
    contentType: string;
    boundary: string;
    params: HttpZParam[] | HttpZBodyParam[];
    text: string;
}

export interface HttpZResponseModel {
    protocolVersion: string;
    statusCode: number;
    statusMessage?: string;
    headers?: Record<string, string>;
    cookies?: HttpZParam[];
    body: HttpZBody;
    headersSize: number;
    bodySize: number;
}

export type ResponseProps = {
    url: string;
    body: string;
    map?: string;
    headers: Headers;
    status: number;
    statusText: string;
};

export type CacheSetOptions = {
    expireIn?: number;
};

export interface Cache {
    get(key: string[]): Promise<ResponseProps | null>;
    set(
        key: string[],
        value: ResponseProps,
        options?: CacheSetOptions,
    ): Promise<void>;
    close(): Promise<void>;
}

export type Config = {
    BASE_PATH: string;
    CACHE: boolean;
    CACHE_CONN_MAX?: number;
    CACHE_CONN_MIN?: number;
    CACHE_REDIRECT?: number;
    CACHE_CLIENT_REDIRECT?: number;
    CACHE_REDIS_HOSTNAME?: string;
    CACHE_REDIS_PORT?: string;
    CACHE_REDIS_USERNAME?: string;
    CACHE_REDIS_PASSWORD?: string;
    CACHE_REDIS_TLS?: boolean;
    DD_TRACE_ENABLED?: boolean;
    HOMEPAGE?: string;
    OUTPUT_BANNER?: string;
    REDIRECT_FASTPATH?: boolean;
    SOURCEMAP_MAX_RETRY?: number;
    UPSTREAM_ORIGIN: string;
    WORKER_ENABLE?: boolean;
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
