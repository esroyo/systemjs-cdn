import { createFetch } from '@esroyo/deno-simple-fetch';
import { dirname, join } from '@std/url';
import { memoize } from '@std/cache';
import { getEsmaVersionFromUA } from 'esm-compat/dist/compat.js';
import type { Fetch, SourceModule } from './types.ts';

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
    'accept-encoding',
    'accept-ranges',
    'age',
    'alt-svc',
    'cf-cache-status',
    'cf-ray',
    'content-length',
    'connection',
    'date',
    'host',
    'last-modified',
    'nel',
    'report-to',
    'server',
    'server-timing',
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
    signal?: AbortSignal,
    fetch: Fetch = createFetch(),
): Promise<string | SourceModule> => {
    try {
        const sourceMapUrl = parseSourceMapUrl(input, baseUrl);
        if (!sourceMapUrl) {
            console.log('parsing sourcemap url failed for', baseUrl);
            return input;
        }
        const sourceMapResponse = await fetch(sourceMapUrl, { signal });
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

/* The default target for unknown browsers */
const defaultTarget = ['es2015', 'HeadlessChrome/52'] as const;
export const getBuildTarget = memoize(
    (userAgent: string): readonly [string, string] => {
        if (userAgent.includes('Mac OS')) {
            return defaultTarget;
        }
        const esmBuildTarget = getEsmaVersionFromUA(userAgent);
        if (esmBuildTarget === 'esnext') {
            return defaultTarget;
        }
        return [esmBuildTarget, userAgent] as const;
    },
);

const registerRegExp =
    /(?:register|import)\(\[?(?:['"][^'"]+['"](?:,\s*)?)*\]?/gm;
const absolutePathRegExp = /['"][^'"]+['"]/gm;
const absolutePathReplaceRegExp = /^(['"])\//;
export const parseRequestUrl = (
    { url, realOrigin, basePath, upstreamOrigin }: {
        url: string;
        realOrigin?: string;
        basePath: string;
        upstreamOrigin: string;
    },
) => {
    if (!upstreamOrigin.endsWith('/')) {
        throw new TypeError(
            `Upstream origin must have a path: "${upstreamOrigin}"`,
        );
    }

    if (!basePath) {
        throw new TypeError('Base path is required');
    }

    if (basePath.length === 1 && basePath !== '/') {
        throw new TypeError(`Bad base path: "${basePath}`);
    }

    if (basePath.length > 1 && basePath.endsWith('/')) {
        throw new TypeError(`Base path must not end with slash: "${basePath}"`);
    }

    // "http://0.0.0.0:8000/sjs/vue"
    const actualUrl = new URL(url);

    // "/sjs/"
    const basePathWithSlash = basePath === '/' ? basePath : `${basePath}/`;

    // "https://systemjs.comu.cat/"
    const finalOriginUrl = realOrigin ? new URL(realOrigin) : actualUrl;

    // "http://0.0.0.0:8000/sjs/"
    const selfOriginActual = `${actualUrl.origin}${basePathWithSlash}`;

    // "https://systemjs.comu.cat/sjs/"
    const selfOriginFinal = `${finalOriginUrl.origin}${basePathWithSlash}`;

    // "https://esm.sh/vue"
    const upstreamUrl = new URL(
        url.replace(selfOriginActual, ''),
        upstreamOrigin,
    );

    // "https://systemjs.comu.cat/sjs/vue"
    const publicUrl = new URL(
        url.replace(actualUrl.origin, finalOriginUrl.origin),
    );

    const upstreamOriginRegExp = new RegExp(upstreamOrigin, 'ig');
    const replaceUrls = (str: string): string => {
        return str.replace(upstreamOriginRegExp, selfOriginFinal)
            .replace(registerRegExp, (registerMatch) => {
                return registerMatch.replace(
                    absolutePathRegExp,
                    (absolutePathMatch) => {
                        return absolutePathMatch.replace(
                            absolutePathReplaceRegExp,
                            `$1${basePathWithSlash}`,
                        );
                    },
                );
            });
    };

    return {
        actualUrl,
        publicUrl,
        replaceUrls,
        upstreamUrl,
    };
};

export function cloneRequest(
    req: Request,
    overwrite: RequestInit & { url?: URL | string } = {},
): Request {
    return new Request(
        overwrite.url || req.url,
        {
            // body
            cache: overwrite.cache ?? req.cache,
            credentials: overwrite.credentials ?? req.credentials,
            headers: overwrite.headers ?? req.headers,
            integrity: overwrite.integrity ?? req.integrity,
            keepalive: overwrite.keepalive ?? req.keepalive,
            method: overwrite.method ?? req.method,
            mode: overwrite.mode ?? req.mode,
            redirect: overwrite.redirect ?? req.redirect,
            referrer: overwrite.referrer ?? req.referrer,
            referrerPolicy: overwrite.referrerPolicy ?? req.referrerPolicy,
            // signal
            // window
        },
    );
}
