import { kvGet, kvSet, request } from '../deps.ts';
import { denoKv } from './services.ts';

import type { HttpZResponseModel, ResponseProps } from './types.ts';

export const nodeRequest = async (
    url: string,
    init: RequestInit,
): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
        const headers = Object.fromEntries(new Headers(init.headers).entries());
        request(
            {
                method: init.method || 'GET',
                url,
                followRedirect: !init.redirect || init.redirect === 'follow',
                headers,
            },
            function (
                error: Error,
                response: HttpZResponseModel,
                body: string,
            ) {
                if (error) {
                    return reject(error);
                }
                resolve(
                    new Response(body, {
                        headers: response.headers,
                        status: response.statusCode,
                        statusText: response.statusMessage,
                    }),
                );
            },
        );
    });
};

export const fetch = globalThis.fetch;

export const cloneHeaders = (
    headers: Headers,
    ...iteratees: Array<
        (pair: [string, string] | null) => [string, string] | null
    >
): Headers => (new Headers(
    Object.fromEntries(
        [...headers.entries()].map((pair) => {
            return iteratees.reduce<[string, string] | null>(
                (value, currentIteratee) => currentIteratee(value),
                pair,
            ) || null;
        }).filter(<T>(pair: T): pair is NonNullable<T> => pair !== null),
    ),
));

const denyHeadersList = [
    'access-control-expose-headers',
    'age',
    'alt-svc',
    'cf-cache-status',
    'cf-ray',
    'content-length',
    'host',
    'nel',
    'report-to',
    'server',
    'x-content-source',
    'x-debug',
    'x-esm-id',
    'x-real-origin',
    'x-typescript-types',
];

export const denyHeaders = (
    pair: [string, string] | null,
) => (pair !== null && denyHeadersList.includes(pair[0]) ? null : pair);

export const isJsResponse = (response: Response): boolean => {
    return !!(response.headers.get('content-type')?.startsWith(
        'application/javascript',
    ));
};

export const isRedirect = (status: number): boolean => {
    return status >= 300 && status < 400;
};

export const isOk = (status: number): boolean => {
    return status >= 200 && status < 300;
};

export const retrieveCache = async (
    kv: Promise<Deno.Kv>,
    key: Deno.KvKey,
): Promise<ResponseProps | null> => {
    const settledKv = await kv;
    const blob = await kvGet(settledKv, ['cache', ...key]);
    const value = blob && JSON.parse(new TextDecoder().decode(blob));
    //settledKv.close();
    const isValidCacheEntry = !!(
        value &&
        value.expires &&
        value.expires > Date.now()
    );
    return isValidCacheEntry ? value : null;
};

const calcExpires = (headers: Headers): string => {
    const DEFAULT = '600';
    const cacheControl = Object.fromEntries((headers.get('cache-control') ?? '').split(/\s*,\s*/g).map((part) => part.split('=')));
    const effectiveMaxAge = Number(cacheControl['max-age'] || DEFAULT) * 1000; 
    const expires = String(Date.now() + effectiveMaxAge);
    return expires;
};

export const saveCache = async (
    kv: Promise<Deno.Kv>,
    key: Deno.KvKey,
    value: ResponseProps,
): Promise<void> => {
    const blob = new TextEncoder().encode(JSON.stringify({
        ...value,
        expires: calcExpires(value.headers), 
        headers: Object.fromEntries(value.headers.entries()),
    }));
    const settledKv = await kv;
    await kvSet(settledKv, ['cache', ...key], blob);
    //settledKv.close();
};

const buildDebugPerformance = (performance: Performance): string => (
    performance.getEntriesByType('measure')
      .map(({ name, duration }) => `${name}${duration ? `;dur=${duration}` : ''}`)
      .join(',')
);

export const createFinalResponse = async (
    responseProps: ResponseProps,
    performance: Performance,
    buildTarget: string,
    shouldCache: boolean,
): Promise<Response> => {
    const {
        url,
        body,
        headers,
        status,
        statusText,
    } = responseProps;
    if (!headers.has('access-control-allow-origin')) {
        headers.set('access-control-allow-origin', '*');
    }
    const isCacheable = isOk(status) || isRedirect(status);
    const willCache = shouldCache && isCacheable;
    if (willCache) {
        performance.mark('cache-write');
        await saveCache(denoKv, [url, buildTarget], responseProps);
        performance.measure('cache-write', 'cache-write');
    }

    performance.measure('total', 'total');
    headers.set('server-timing', buildDebugPerformance(performance));

    const response = new Response(body, {
        headers,
        status,
        statusText,
    });

    return response;
};

export const _internals = {
    fetch: nodeRequest,
};
