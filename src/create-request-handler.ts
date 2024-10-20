import opentelemetry from '@opentelemetry/api';
import {
    buildSourceModule,
    calcExpires,
    cloneHeaders,
    denyHeaders,
    filterUpstreamHeaders,
    getBuildTarget,
    isForbidden,
    isJsResponse,
    isNotFound,
    isOk,
    isRedirect,
    nodeRequest,
} from './utils.ts';
import { toSystemjs } from './to-systemjs.ts';
import { type Pool } from 'generic-pool';
import { basename } from '@std/url';
import type { Cache, Config, OpenTelemetry, ResponseProps } from './types.ts';

export function createRequestHandler(
    config: Config,
    cachePool?: Pool<Cache>,
    workerPool?: Pool<Worker>,
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
        SOURCEMAP_MAX_RETRY,
    } = config;
    const tracer = otel.trace.getTracer('web');

    const createFinalResponse = async (
        responseProps: ResponseProps,
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
        const isActualRedirect = isRedirect(responseProps);
        const isCacheable = isForbidden(responseProps) ||
            isNotFound(responseProps) || isOk(responseProps) ||
            isActualRedirect;
        const willCache = shouldCache && isCacheable;
        if (willCache) {
            const cacheAcquireSpan = tracer.startSpan('cache-acquire');
            const cache = await cachePool?.acquire();
            cacheAcquireSpan.end();
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
            if (cache) {
                await cachePool?.release(cache);
            }
            cacheWriteSpan.end();
        }
        if (
            CACHE_CLIENT_REDIRECT && isActualRedirect &&
            !headers.has('cache-control')
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

    return async function requestHandler(
        req: Request,
    ): Promise<Response> {
        const createFastPathResponse = async (
            response: Response,
        ): Promise<Response> => {
            const location = response.headers.get('location');
            if (!location) {
                return response;
            }
            return tracer.startActiveSpan(
                'redirect-fastpath',
                async (span) => {
                    const fastResponse = await requestHandler(
                        new Request(location, { headers: req.headers }),
                    );
                    const headers = new Headers(fastResponse.headers);
                    headers.set(
                        'cache-control',
                        `public, max-age=${CACHE_CLIENT_REDIRECT}`,
                    );
                    span.end();
                    return new Response(fastResponse.body, {
                        headers,
                        status: fastResponse.status,
                        statusText: fastResponse.statusText,
                    });
                },
            );
        };

        // Step: tracing
        const rootSpan = otel.trace.getActiveSpan();
        const originalUserAgent = req.headers.get('user-agent') ?? '';
        const [buildTarget, upstreamUserAgent] = getBuildTarget(
            originalUserAgent,
        );
        const selfUrl = new URL(req.url);
        const basePath = BASE_PATH === '/' ? BASE_PATH : `${BASE_PATH}/`;
        if (selfUrl.pathname === BASE_PATH || selfUrl.pathname === basePath) {
            return new Response(null, {
                status: 302,
                headers: { 'location': HOMEPAGE || UPSTREAM_ORIGIN },
            });
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
        const isRawRequest = selfUrl.searchParams.has('raw');
        const isMapRequest = publicSelfUrl.endsWith('.map');
        rootSpan?.setAttributes({
            'esm.build.target': buildTarget,
            'http.route': BASE_PATH,
            'http.url': publicSelfUrl,
        });
        if (isMapRequest && !CACHE) {
            // Sourcemaps are only enabled with CACHE
            // otherwise they are served as inlined data uris
            // thus it is not possible to receive a sourcemap request when !CACHE
            return new Response(null, { status: 404 });
        }
        if (CACHE) {
            const cacheAcquireSpan = tracer.startSpan('cache-acquire');
            const cache = await cachePool?.acquire();
            cacheAcquireSpan.end();
            const cacheKey = [
                isMapRequest ? publicSelfUrl.slice(0, -4) : publicSelfUrl,
                buildTarget,
            ];
            const cacheReadSpan = tracer.startSpan('cache-read', {
                attributes: {
                    'span.type': 'cache',
                    'systemjs.cache.key': cacheKey,
                },
            });
            const cachedValue = await cache?.get(cacheKey);
            if (cache) {
                await cachePool?.release(cache);
            }
            cacheReadSpan.addEvent(cachedValue ? 'cache-hit' : 'cache-miss');
            cacheReadSpan.end();
            if (isMapRequest) {
                // A sourcemap request always should come after the original JS module
                // thus, it MUST be already in the cache of the original JS module URL
                // or we just return an 404
                if (cachedValue && cachedValue.map) {
                    return new Response(cachedValue.map, {
                        headers: {
                            'access-control-allow-methods': '*',
                            'access-control-allow-origin': '*',
                            'cache-control':
                                'public, max-age=31536000, immutable',
                            'content-type': 'application/json; charset=utf-8',
                        },
                    });
                }
                return new Response(null, { status: 404 });
            }
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
                    return createFastPathResponse(response);
                }
                return response;
            }
        }
        const upstreamUrlString = upstreamUrl.toString();
        const upstreamSpan = tracer.startSpan('upstream', {
            attributes: {
                'span.type': 'http',
                'http.url': upstreamUrlString,
            },
        });
        const upstreamResponse = await fetch(upstreamUrlString, {
            headers: cloneHeaders(
                req.headers,
                denyHeaders,
                filterUpstreamHeaders,
                (
                    pair: [string, string] | null,
                ) => (pair && pair[0] === 'user-agent'
                    ? [pair[0], upstreamUserAgent]
                    : pair),
            ),
            redirect: 'manual',
        });
        let body = await upstreamResponse.text();
        let map: string | undefined = undefined;
        upstreamSpan.end();
        if (!isRawRequest && isJsResponse(upstreamResponse)) {
            const sourcemapSpan = tracer.startSpan('sourcemap');
            const sourceModule = await buildSourceModule(
                body,
                upstreamUrlString,
                SOURCEMAP_MAX_RETRY,
            );
            const canGenerateSourcemap =
                !!(typeof sourceModule === 'object' && sourceModule.map);
            const sourcemap = canGenerateSourcemap
                ? (CACHE ? true : 'inline')
                : false;
            const sourcemapFileNames = sourcemap === true
                ? `${basename(publicSelfUrl)}.map`
                : undefined;
            sourcemapSpan.end();
            const buildSpan = tracer.startSpan('build');
            const buildResult = await toSystemjs(sourceModule, {
                banner: OUTPUT_BANNER,
                sourcemap,
                sourcemapFileNames,
            }, workerPool);
            body = replaceOrigin(buildResult.code);
            if (sourcemap === true) {
                map = buildResult.map;
            }
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
                map,
                status: upstreamResponse.status,
                statusText: upstreamResponse.statusText,
            },
            buildTarget,
            !!(CACHE && (!isRedirect(upstreamResponse) || CACHE_REDIRECT)),
        );
        if (REDIRECT_FASTPATH && isRedirect(response)) {
            return createFastPathResponse(response);
        }
        return response;
    };
}
