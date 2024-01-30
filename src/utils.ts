import { request } from '../deps.ts';

import type { HttpZResponseModel } from './types.ts';

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

export const _internals = {
    fetch: nodeRequest,
};
