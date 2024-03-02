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
    'date',
    'alt-svc',
    'cf-cache-status',
    'cf-ray',
    'content-length',
    'host',
    'nel',
    'report-to',
    'server',
    'via',
    'x-amz-cf-id',
    'x-amz-cf-pop',
    'x-cache',
    'x-content-source',
    'x-debug',
    'x-esm-id',
    'x-forwarded-for',
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

export const isRedirect = ({ status }: { status: number }): boolean => {
    return status >= 300 && status < 400;
};

export const isOk = ({ status }: { status: number }): boolean => {
    return status >= 200 && status < 300;
};

export const isNotFound = ({ status }: { status: number }): boolean => {
    return status === 404;
};

export const isForbidden = ({ status }: { status: number }): boolean => {
    return status === 403;
};

export const calcExpires = (
    headers: Headers,
): { maxAge: number; expires: string } => {
    const DEFAULT = '600';
    const cacheControl = Object.fromEntries(
        (headers.get('cache-control') ?? '').split(/\s*,\s*/g).map((part) =>
            part.split('=')
        ),
    );
    const effectiveMaxAge = Number(cacheControl['max-age'] || DEFAULT) * 1000;
    const expires = String(Date.now() + effectiveMaxAge);
    return {
        maxAge: effectiveMaxAge,
        expires,
    };
};

export const buildDebugPerformance = (performance: Performance): string => (
    performance.getEntriesByType('measure')
        .map(({ name, duration }) =>
            `${name}${duration ? `;dur=${duration}` : ''}`
        )
        .join(',')
);
