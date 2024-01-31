import {
    kvSet,
    request,
} from '../deps.ts';

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
                resolve(new Response(body, {
                    headers: response.headers,
                    status: response.statusCode,
                    statusText: response.statusMessage,
                }));
            },
        );
    });
};

export const fetch = globalThis.fetch;

export const cloneHeaders = (
    headers: Headers,
    ...iteratees: Array<(pair: [string, string] | null) => ([string, string] | null)>
): Headers => (new Headers(
    Object.fromEntries(
        [...headers.entries()].map((pair) => {
            return iteratees.reduce<[string, string] | null>((value, currentIteratee) => currentIteratee(value), pair) || null;
        }).filter(<T>(pair: T): pair is NonNullable<T> => pair !== null)
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

export const denyHeaders = (pair: [string, string] | null) => (pair !== null && denyHeadersList.includes(pair[0]) ? null : pair);

export const isJsResponse = (response: Response): boolean => {
    return !!(response.headers.get('content-type')?.startsWith('application/javascript'));
}

export const isRedirectResponse = (response: Response): boolean => {
    return response.status >= 300 && response.status < 400;
}

export const isTestEnv = () => Deno.env.get('DENO_ENV') === 'test';

export const isValidCacheEntry = (value: ResponseProps | null): value is ResponseProps => {
    return !!(value && value.ctime && (Date.now() - value.ctime < 600000));
}

export const handleResponse = async (responseProps: ResponseProps, shouldCache = !isTestEnv()): Promise<Response> => {
    const {
        url,
        body,
        headers,
        status,
        statusText,
    } = responseProps;
    headers.set('x-cache-status', shouldCache ? 'MISS' : 'HIT'); 
    const response = new Response(body, {
        headers,
        status,
        statusText,
    });
    const isCacheable = isJsResponse(response) || isRedirectResponse(response);
    if (shouldCache && isCacheable) {
        try {
            const kv = await Deno.openKv();
            const blob = new TextEncoder().encode(JSON.stringify({
                ...responseProps,
                ctime: Date.now(),
                headers: Object.fromEntries(headers.entries()),
            }));
            await kvSet(kv, ['cache', url], blob);
            kv.close();
        } catch (error) {
            console.error(error);
        }
    }
    return response;
}

export const _internals = {
    fetch: nodeRequest,
};
