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
    CACHE_REDIRECT?: number;
    CACHE_CLIENT_REDIRECT?: number;
    CACHE_REDIS_HOSTNAME?: string;
    HOMEPAGE?: string;
    OUTPUT_BANNER?: string;
    REDIRECT_FASTPATH?: boolean;
    UPSTREAM_ORIGIN: string;
    WORKER_ENABLE?: boolean;
};
