import { kvGet, kvSet, request } from '../deps.ts';
import { resolveConfig } from './resolve-config.ts';

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

export const isRedirectResponse = (response: Response): boolean => {
    return response.status >= 300 && response.status < 400;
};

export const retrieveCache = async (
    kv: Promise<Deno.Kv>,
    key: Deno.KvKey,
): Promise<ResponseProps | null> => {
    const { CACHE_MAXAGE } = await resolveConfig();
    const settledKv = await kv;
    const blob = await kvGet(settledKv, ['cache', ...key]);
    const value = blob && JSON.parse(new TextDecoder().decode(blob));
    settledKv.close();
    const isValidCacheEntry = !!(
        value &&
        value.ctime &&
        (Date.now() - value.ctime < (Number(CACHE_MAXAGE) * 1000))
    );
    return isValidCacheEntry ? value : null;
};

export const saveCache = async (
    kv: Promise<Deno.Kv>,
    key: Deno.KvKey,
    value: ResponseProps,
): Promise<void> => {
    const blob = new TextEncoder().encode(JSON.stringify({
        ...value,
        ctime: Date.now(),
        headers: Object.fromEntries(value.headers.entries()),
    }));
    const settledKv = await kv;
    await kvSet(settledKv, ['cache', ...key], blob);
    settledKv.close();
};

const buildDebugPerformance = (performance: Performance) => {
    return JSON.stringify([
        ...performance.getEntriesByType('measure').map((
            { name, duration },
        ) => ({
            name,
            duration,
        })),
    ]);
};

export const createFinalResponse = async (
    responseProps: ResponseProps,
    performance: Performance,
    buildTarget: string,
    isCached: boolean,
): Promise<Response> => {
    const { CACHE_MAXAGE } = await resolveConfig();
    const {
        url,
        body,
        headers,
        status,
        statusText,
    } = responseProps;
    headers.set('x-cache-status', isCached ? 'HIT' : 'MISS');
    if (!headers.has('access-control-allow-origin')) {
        headers.set('access-control-allow-origin', '*');
    }
    performance.measure('total', 'total');
    headers.set('x-debug-performance', buildDebugPerformance(performance));

    const response = new Response(body, {
        headers,
        status,
        statusText,
    });
    const isCacheable = isJsResponse(response) || isRedirectResponse(response);
    const shouldCache = !isCached && isCacheable && Number(CACHE_MAXAGE);
    if (shouldCache) {
        await saveCache(Deno.openKv(), [url, buildTarget], responseProps);
    }
    return response;
};

export const _internals = {
    fetch: nodeRequest,
};
