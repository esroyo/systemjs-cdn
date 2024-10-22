import request from 'request';
import { dirname, join } from '@std/url';
import { getEsmaVersionFromUA } from 'esm-compat';
import type { HttpZResponseModel, SourceModule } from './types.ts';

export const nodeRequest = async (
    url: string,
    init?: RequestInit,
): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
        const headers = Object.fromEntries(
            new Headers(init?.headers ?? {}).entries(),
        );
        request(
            {
                method: init?.method || 'GET',
                url,
                followRedirect: !init?.redirect || init.redirect === 'follow',
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

export const filterUpstreamHeaders = (
    pair: [string, string] | null,
) => (pair !== null && ['accept-encoding'].includes(pair[0])
    ? [
        pair[0],
        pair[1].split(',').map((i) => i.trim()).filter((i) => i !== 'zstd')
            .join(','),
    ] as [string, string]
    : pair);

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
    DEFAULT = 600,
): number => {
    const cacheControl = Object.fromEntries(
        (headers.get('cache-control') ?? '').split(/\s*,\s*/g).map((part) =>
            part.split('=')
        ),
    );
    const effectiveMaxAge = Number(cacheControl['max-age'] || DEFAULT) * 1000;
    return effectiveMaxAge;
};

/**
 * Make sure the base path is not empty, starts with "/"
 * and does not end with "/" when length is > 1
 */
export const sanitizeBasePath = (originalBasePath?: string): string => {
    if (!originalBasePath) {
        return '/';
    }
    const url = new URL(originalBasePath, 'http://x');
    return url.pathname.length > 1 && url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname;
};

/**
 * Make sure the URL is complete including a minimum path,
 * and does not end with "/" when path length is > 1
 */
export const sanitizeUpstreamOrigin = (
    originalUpstreamOrigin?: string,
): string => {
    if (!originalUpstreamOrigin) {
        return '';
    }
    const url = new URL(originalUpstreamOrigin);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
    }
    return `${url.origin}${url.pathname}`;
};

export const parseSourceMapUrl = (
    input: string,
    baseUrl?: string,
): string | undefined => {
    const m = input.match(/^\/\/# sourceMappingURL=(\S+)/m);
    if (!m) {
        return undefined;
    }
    if (!baseUrl) {
        return m[1];
    }
    return join(dirname(baseUrl), m[1]).toString();
};

export const buildSourceModule = async (
    input: string,
    baseUrl: string,
    fetch = nodeRequest,
): Promise<string | SourceModule> => {
    try {
        const sourceMapUrl = parseSourceMapUrl(input, baseUrl);
        if (!sourceMapUrl) {
            console.log('parsing sourcemap url failed for', baseUrl);
            return input;
        }
        let sourceMapResponse = await fetch(sourceMapUrl);
        if (!sourceMapResponse.ok) {
            console.log('fetching sourcemap failed', { baseUrl, sourceMapUrl });
            console.log('fetching sourcemap response', sourceMapResponse);
            return input;
        }
        return {
            code: input,
            map: await sourceMapResponse.text(),
            name: baseUrl,
        };
    } catch (reason) {
        console.log('build sourcemap exception:');
        console.error(reason);
        return input;
    }
};

export const getBuildTarget = (userAgent: string): [string, string] => {
    const esmBuildTarget = getEsmaVersionFromUA(userAgent);
    if (esmBuildTarget === 'esnext') {
        // this is the default for unknown browsers
        return ['es2015', 'HeadlessChrome/51'];
    }
    return [esmBuildTarget, userAgent];
};
