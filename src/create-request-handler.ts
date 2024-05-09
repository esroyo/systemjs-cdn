import {
    calcExpires,
    cloneHeaders,
    denyHeaders,
    isForbidden,
    isJsResponse,
    isNotFound,
    isOk,
    isRedirect,
    nodeRequest,
} from './utils.ts';
import { toSystemjs } from './to-systemjs.ts';
import { getBuildTargetFromUA, opentelemetry } from '../deps.ts';
import type { Cache, Config, OpenTelemetry, ResponseProps } from './types.ts';

export function createRequestHandler(
    config: Config,
    cache?: Cache,
    fetch = nodeRequest,
    otel: OpenTelemetry = opentelemetry,
): (request: Request) => Promise<Response> {
    const {
        BASE_PATH,
        CACHE,
        CACHE_CLIENT_REDIRECT,
        CACHE_REDIRECT,
        UPSTREAM_ORIGIN,
        HOMEPAGE,
        OUTPUT_BANNER,
        REDIRECT_FASTPATH,
    } = config;
    const tracer = otel.trace.getTracer('web');

    const createFinalResponse = async (
        responseProps: ResponseProps,
        buildTarget: string,
        shouldCache: boolean,
        isFastPathRedirect?: boolean,
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
        const isActualRedirect = isRedirect(responseProps) &&
            !isFastPathRedirect;
        const isCacheable = isForbidden(responseProps) ||
            isNotFound(responseProps) || isOk(responseProps) ||
            isActualRedirect;
        const willCache = shouldCache && isCacheable;
        if (willCache) {
            const cacheKey = [url, buildTarget];
            const cacheWriteSpan = tracer.startSpan('cache-write', {
                attributes: {
                    'span.type': 'cache',
                    'systemjs.cache.key': cacheKey,
                },
            });
            await cache?.set(
                cacheKey,
                responseProps,
                { expireIn: calcExpires(headers, CACHE_REDIRECT) },
            );
            cacheWriteSpan.end();
        }
        if (
            CACHE_CLIENT_REDIRECT &&
            (
                isFastPathRedirect ||
                (isActualRedirect && !headers.has('cache-control'))
            )
        ) {
            headers.set(
                'cache-control',
                `public, max-age=${CACHE_CLIENT_REDIRECT}`,
            );
        }

        const response = new Response(body, {
            headers,
            status,
            statusText,
        });

        return response;
    };

    const createFastPathResponse = async (
        response: Response,
        buildTarget: string,
    ): Promise<Response> => {
        const redirectLocation = response.headers.get('location');
        if (!redirectLocation) {
            return response;
        }
        const cacheKey = [redirectLocation, buildTarget];
        const redirectCacheReadSpan = tracer.startSpan('redirect-cache-read', {
            attributes: {
                'span.type': 'cache',
                'systemjs.cache.key': cacheKey,
            },
        });
        const cachedValue = await cache?.get(cacheKey);
        redirectCacheReadSpan.addEvent(
            cachedValue ? 'redirect-cache-hit' : 'redirect-cache-miss',
        );
        redirectCacheReadSpan.end();
        if (cachedValue) {
            return createFinalResponse(
                {
                    ...cachedValue,
                    headers: new Headers(cachedValue.headers),
                },
                buildTarget,
                false,
                true,
            );
        }

        return new Response(response.body, {
            headers: cloneHeaders(response.headers),
            status: response.status,
            statusText: response.statusText,
        });
    };

    return async function requestHandler(
        req: Request,
    ): Promise<Response> {
        // Step: tracing
        const rootSpan = otel.trace.getActiveSpan();
        const buildTarget = getBuildTargetFromUA(req.headers.get('user-agent'));
        const selfUrl = new URL(req.url);
        const basePath = BASE_PATH === '/' ? BASE_PATH : `${BASE_PATH}/`;
        if (selfUrl.pathname === BASE_PATH || selfUrl.pathname === basePath) {
            return Response.redirect(HOMEPAGE || UPSTREAM_ORIGIN, 302);
        }
        const finalOriginUrl = new URL(
            req.headers.get('x-real-origin') ?? selfUrl,
        );
        const selfOriginActual = `${selfUrl.origin}${basePath}`;
        const selfOriginFinal = `${finalOriginUrl.origin}${basePath}`;
        const upstreamUrl = new URL(
            req.url.replace(selfOriginActual, ''),
            UPSTREAM_ORIGIN,
        );
        const replaceOrigin = (() => {
            const upstreamOriginRegExp = new RegExp(UPSTREAM_ORIGIN, 'ig');
            const registerRegExp =
                /(?:register|import)\(\[?(?:['"][^'"]+['"](?:,\s*)?)*\]?/gm;
            const absolutePathRegExp = /['"][^'"]+['"]/gm;
            const absolutePathReplaceRegExp = /^(['"])\//;
            return (str: string): string => {
                return str.replace(upstreamOriginRegExp, selfOriginFinal)
                    .replace(registerRegExp, (registerMatch) => {
                        return registerMatch.replace(
                            absolutePathRegExp,
                            (absolutePathMatch) => {
                                return absolutePathMatch.replace(
                                    absolutePathReplaceRegExp,
                                    `$1${basePath}`,
                                );
                            },
                        );
                    });
            };
        })();
        const replaceOriginHeaders = (
            pair: [string, string] | null,
        ):
            | [string, string]
            | null => (pair === null
                ? pair
                : [pair[0], replaceOrigin(pair[1])]);
        const publicSelfUrl = new URL(
            req.url.replace(selfUrl.origin, finalOriginUrl.origin),
        )
            .toString();
        rootSpan?.setAttributes({
            'esm.build.target': buildTarget,
            'http.route': BASE_PATH,
            'http.url': publicSelfUrl,
        });
        if (CACHE) {
            const cacheKey = [publicSelfUrl, buildTarget];
            const cacheReadSpan = tracer.startSpan('cache-read', {
                attributes: {
                    'span.type': 'cache',
                    'systemjs.cache.key': cacheKey,
                },
            });
            const cachedValue = await cache?.get(cacheKey);
            cacheReadSpan.addEvent(cachedValue ? 'cache-hit' : 'cache-miss');
            cacheReadSpan.end();
            if (cachedValue) {
                const response = await createFinalResponse(
                    {
                        ...cachedValue,
                        headers: new Headers(cachedValue.headers),
                    },
                    buildTarget,
                    false,
                );
                if (REDIRECT_FASTPATH && isRedirect(response)) {
                    const fastResponse = await createFastPathResponse(
                        response,
                        buildTarget,
                    );
                    return fastResponse;
                }
                return response;
            }
        }
        const upstreamSpan = tracer.startSpan('upstream', {
            attributes: { 'span.type': 'http' },
        });
        const upstreamResponse = await fetch(upstreamUrl.toString(), {
            headers: cloneHeaders(req.headers, denyHeaders),
            redirect: 'manual',
        });
        let body = await upstreamResponse.text();
        upstreamSpan.end();
        if (isJsResponse(upstreamResponse)) {
            const buildSpan = tracer.startSpan('build');
            body = replaceOrigin(
                await toSystemjs(body, { banner: OUTPUT_BANNER }, config),
            );
            buildSpan.end();
        } else {
            body = replaceOrigin(body);
        }
        const response = await createFinalResponse(
            {
                url: publicSelfUrl,
                body,
                headers: cloneHeaders(
                    upstreamResponse.headers,
                    denyHeaders,
                    replaceOriginHeaders,
                ),
                status: upstreamResponse.status,
                statusText: upstreamResponse.statusText,
            },
            buildTarget,
            !!(CACHE && (!isRedirect(upstreamResponse) || CACHE_REDIRECT)),
        );
        if (CACHE && REDIRECT_FASTPATH && isRedirect(response)) {
            const fastResponse = await createFastPathResponse(
                response,
                buildTarget,
            );
            return fastResponse;
        }
        return response;
    };
}
