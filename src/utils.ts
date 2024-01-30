import { request } from '../deps.ts';

import type { HttpZResponseModel } from './types.ts';

export const nodeRequest = async (
    url: string,
    init: RequestInit,
): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
        request(
            {
                method: init.method || 'GET',
                url,
                followRedirect: !init.redirect || init.redirect === 'follow',
                headers: init.headers || {},
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
                    headers: Object.fromEntries(
                        response.headers?.map(({ name, value }) => [name, value || '']) || []
                    ),
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
    iteratee = (value: string) => value,
): Headers => (new Headers(
    Object.fromEntries(
        [...headers.entries()].map(([name, value]) => {
            return value ? [name, iteratee(value)] : [name];
        }),
    ),
));

export const _internals = {
    fetch: nodeRequest,
};
