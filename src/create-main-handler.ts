import opentelemetry from '@opentelemetry/api';
import {
    buildSourceModule,
    cloneHeaders,
    cloneRequest,
    denyHeaders,
    getBuildTarget,
    isForbidden,
    isJsResponse,
    isNotFound,
    isOk,
    isRedirect,
    nodeRequest,
    parseRequestUrl,
} from './utils.ts';
import { toSystemjs } from './to-systemjs.ts';
import { type Pool } from 'generic-pool';
import { basename } from '@std/url';
import type { Config, OpenTelemetry } from './types.ts';

const finalizeFastPathResponse = (
    config: Config,
    response: Response,
): Response => {
    if (config.CACHE_CLIENT_REDIRECT) {
        // Overwritte this values only for the clients, never cache
        response.headers.delete('age');
        response.headers.set(
            'cache-control',
            `public, max-age=${config.CACHE_CLIENT_REDIRECT}`,
        );
    }
    return response;
};
const createFastPathResponse = async (
    config: Config,
    response: Response,
    originalRequest: Request,
    originalRequestHandler: (req: Request) => Promise<Response>,
    tracer: opentelemetry.Tracer,
): Promise<Response> => {
    if (!config.REDIRECT_FASTPATH) {
        return finalizeFastPathResponse(config, response);
    }
    const location = response.headers.get('location');
    if (!location) {
        return finalizeFastPathResponse(config, response);
    }
    return tracer.startActiveSpan(
        'redirect-fastpath',
        async (span) => {
            const fastResponse = await originalRequestHandler(
                new Request(location, {
                    headers: originalRequest.headers,
                    signal: originalRequest.signal,
                }),
            );
            fastResponse.headers.set('x-location', location);
            span.end();
            return finalizeFastPathResponse(config, fastResponse);
        },
    );
};

export function createMainHandler(
    config: Config,
    cache?: Cache,
    workerPool?: Pool<Worker>,
    fetch = nodeRequest,
    otel: OpenTelemetry = opentelemetry,
): (request: Request) => Promise<Response> {
    const {
        BASE_PATH,
        CACHE_ENABLE,
        CACHE_REDIRECT,
        HOMEPAGE,
        OUTPUT_BANNER,
        ROLLUP_PLUGIN,
        UPSTREAM_ORIGIN,
        UPSTREAM_TIMEOUT,
    } = config;
    const tracer = otel.trace.getTracer('web');

    return async function requestHandler(
        request: Request,
    ): Promise<Response> {
        const rootSpan = otel.trace.getActiveSpan();
        const originalUserAgent = request.headers.get('user-agent') ?? '';
        const [buildTarget, upstreamUserAgent] = getBuildTarget(
            originalUserAgent,
        );
        const {
            actualUrl,
            publicUrl: _publicUrl,
            replaceUrls,
            upstreamUrl,
        } = parseRequestUrl({
            url: request.url,
            basePath: BASE_PATH,
            realOrigin: request.headers.get('x-real-origin') ?? undefined,
            upstreamOrigin: UPSTREAM_ORIGIN,
        });

        if (upstreamUrl.toString() === UPSTREAM_ORIGIN) {
            return new Response(null, {
                status: 302,
                headers: { 'location': HOMEPAGE },
            });
        }

        const publicUrl = _publicUrl.toString();
        const normalizedRequest = cloneRequest(request, { url: publicUrl });
        const replaceOriginHeaders = (
            pair: [string, string] | null,
        ):
            | [string, string]
            | null => (pair === null ? pair : [pair[0], replaceUrls(pair[1])]);
        const isRawRequest = actualUrl.searchParams.has('raw');
        const isMapRequest = publicUrl.endsWith('.map');
        rootSpan?.setAttributes({
            'esm.build.target': buildTarget,
            'http.route': upstreamUrl.toString().replace(UPSTREAM_ORIGIN, '/'),
            'http.url': publicUrl,
        });

        if (isMapRequest && !CACHE_ENABLE) {
            // Sourcemaps are only enabled with CACHE
            // otherwise they are served as inlined data uris
            // thus it is not possible to receive a sourcemap request when !CACHE
            return new Response(null, { status: 404 });
        }

        if (
            CACHE_ENABLE &&
            cache /* && !request.headers.get('cache-control')?.includes('no-cache') */
        ) {
            const cacheReadSpan = tracer.startSpan('cache-read', {
                attributes: { 'span.type': 'cache' },
            });
            const cachedResponse = await cache.match(normalizedRequest);
            const eventName = cachedResponse ? 'cache-hit' : 'cache-miss';
            cacheReadSpan.addEvent(eventName);
            cacheReadSpan.setAttribute(eventName, true);
            cacheReadSpan.end();
            if (cachedResponse) {
                if (isRedirect(cachedResponse)) {
                    return createFastPathResponse(
                        config,
                        cachedResponse,
                        request,
                        requestHandler,
                        tracer,
                    );
                }
                return cachedResponse;
            }
        }

        const upstreamUrlStr = upstreamUrl.toString();
        const upstreamSpan = tracer.startSpan('upstream', {
            attributes: {
                'span.type': 'http',
                'http.url': upstreamUrlStr,
            },
        });
        const upstreamResponse = await fetch(upstreamUrlStr, {
            headers: cloneHeaders(
                request.headers,
                denyHeaders,
                (
                    pair: [string, string] | null,
                ) => (pair && pair[0] === 'user-agent'
                    ? [pair[0], upstreamUserAgent]
                    : pair),
            ),
            redirect: 'manual',
            signal: request.signal,
            timeout: UPSTREAM_TIMEOUT,
        });
        let body = await upstreamResponse.text();
        let mapBody: string | undefined;
        upstreamSpan.end();

        if (!isRawRequest && isJsResponse(upstreamResponse)) {
            const sourcemapSpan = tracer.startSpan('sourcemap');
            const sourceModule = await buildSourceModule(
                body,
                upstreamUrlStr,
                request.signal,
            );
            const canGenerateSourcemap =
                !!(typeof sourceModule === 'object' && sourceModule.map);
            const sourcemap = canGenerateSourcemap
                ? (CACHE_ENABLE ? true : 'inline')
                : false;
            const sourcemapFileNames = sourcemap === true
                ? `${basename(publicUrl)}.map`
                : undefined;
            sourcemapSpan.end();

            await tracer.startActiveSpan(
                'build',
                async (span) => {
                    const buildResult = await toSystemjs(
                        sourceModule,
                        {
                            plugin: ROLLUP_PLUGIN,
                            output: {
                                banner: OUTPUT_BANNER,
                                sourcemap,
                                sourcemapFileNames,
                            },
                        },
                        workerPool,
                        request.signal,
                    );
                    body = replaceUrls(buildResult.code);
                    if (sourcemap === true) {
                        mapBody = buildResult.map;
                    }
                    span.end();
                },
            );
        } else {
            body = replaceUrls(body);
        }

        const response = new Response(
            body,
            {
                headers: cloneHeaders(
                    upstreamResponse.headers,
                    denyHeaders,
                    replaceOriginHeaders,
                ),
                status: upstreamResponse.status,
                statusText: upstreamResponse.statusText,
            },
        );

        const isActualRedirect = isRedirect(response);
        const isCacheable = isForbidden(response) ||
            isNotFound(response) ||
            isOk(response) ||
            isActualRedirect;
        const shouldCache =
            !!(CACHE_ENABLE && (!isActualRedirect || CACHE_REDIRECT));
        const willCache = shouldCache && isCacheable && cache;

        let synthMapRequest: Request | null = null;
        let mapResponse: Response | null = null;
        if (mapBody) {
            synthMapRequest = cloneRequest(request, {
                url: `${publicUrl}.map`,
            });
            mapResponse = new Response(
                mapBody,
                {
                    headers: {
                        'access-control-allow-methods': '*',
                        'access-control-allow-headers': '*',
                        'access-control-allow-origin': '*',
                        'cache-control': 'public, max-age=31536000, immutable',
                        'content-type': 'application/json; charset=utf-8',
                    },
                },
            );
        }

        if (!response.headers.has('timing-allow-origin')) {
            response.headers.set('timing-allow-origin', '*');
        }

        response.headers.set('x-esm-target', buildTarget);

        if (willCache) {
            const cacheWriteSpan = tracer.startSpan('cache-write', {
                attributes: { 'span.type': 'cache' },
            });
            const promises: Promise<void>[] = [];
            const clonedResponse = response.clone();
            if (
                isActualRedirect && !clonedResponse.headers.has('cache-control')
            ) {
                clonedResponse.headers.set(
                    'cache-control',
                    `public, max-age=${CACHE_REDIRECT}`,
                );
            }

            promises.push(cache.put(normalizedRequest, clonedResponse));
            if (synthMapRequest && mapResponse) {
                promises.push(cache.put(synthMapRequest, mapResponse));
            }
            Promise.allSettled(promises).then(() => {
                cacheWriteSpan.end();
            });
        }

        if (isActualRedirect) {
            return createFastPathResponse(
                config,
                response,
                request,
                requestHandler,
                tracer,
            );
        }

        return response;
    };
}
