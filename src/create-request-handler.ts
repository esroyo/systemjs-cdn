import {
    buildDebugPerformance,
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
import { getBuildTargetFromUA, ScopedPerformance } from '../deps.ts';
import type { Cache, Config, ResponseProps } from './types.ts';

export function createRequestHandler(
    config: Config,
    cache?: Cache,
    fetch = nodeRequest,
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

    const createFinalResponse = async (
        responseProps: ResponseProps,
        performance: Performance,
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
            performance.mark('cache-write');
            await cache?.set(
                [url, buildTarget],
                responseProps,
            );
            performance.measure('cache-write', 'cache-write');
        }
        const shouldSetCacheClientRedirect = CACHE_CLIENT_REDIRECT &&
            isFastPathRedirect;
        if (shouldSetCacheClientRedirect) {
            headers.set(
                'cache-control',
                `public, max-age=${CACHE_CLIENT_REDIRECT}`,
            );
        }

        if (isFastPathRedirect) {
            performance.clearMeasures('total');
        }
        performance.measure('total', 'total');
        headers.set(
            'server-timing',
            buildDebugPerformance(performance),
        );

        const response = new Response(body, {
            headers,
            status,
            statusText,
        });

        return response;
    };

    const createFastPathResponse = async (
        response: Response,
        performance: Performance,
        buildTarget: string,
    ): Promise<Response> => {
        const redirectLocation = response.headers.get('location');
        if (!redirectLocation) {
            return response;
        }
        performance.mark('redirect-cache-read');
        const value = await cache?.get([
            redirectLocation,
            buildTarget,
        ]);
        performance.measure('redirect-cache-read', 'redirect-cache-read');
        if (value) {
            performance.measure('redirect-cache-hit', {
                start: performance.now(),
            });
            return createFinalResponse(
                {
                    ...value,
                    headers: new Headers(value.headers),
                },
                performance,
                buildTarget,
                false,
                true,
            );
        }
        performance.measure('redirect-cache-miss', {
            start: performance.now(),
        });

        const rebuildedHeaders = cloneHeaders(response.headers);

        performance.clearMeasures('total');
        performance.measure('total', 'total');

        rebuildedHeaders.set(
            'server-timing',
            buildDebugPerformance(performance),
        );
        return new Response(response.body, {
            headers: rebuildedHeaders,
            status: response.status,
            statusText: response.statusText,
        });
    };

    return async function requestHandler(
        req: Request,
    ): Promise<Response> {
        const performance = new ScopedPerformance();
        const disposeReturn = (res: Response) => {
            performance.clearMarks();
            performance.clearMeasures();
            return res;
        };
        performance.mark('total');
        const buildTarget = getBuildTargetFromUA(req.headers.get('user-agent'));
        const selfUrl = new URL(req.url);
        const basePath = BASE_PATH === '/' ? BASE_PATH : `${BASE_PATH}/`;
        if (selfUrl.pathname === BASE_PATH || selfUrl.pathname === basePath) {
            return disposeReturn(
                Response.redirect(HOMEPAGE || UPSTREAM_ORIGIN, 302),
            );
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
        if (CACHE) {
            performance.mark('cache-read');
            const value = await cache?.get([
                publicSelfUrl,
                buildTarget,
            ]);
            performance.measure('cache-read', 'cache-read');
            if (value) {
                performance.measure('cache-hit', { start: performance.now() });
                const response = await createFinalResponse(
                    {
                        ...value,
                        headers: new Headers(value.headers),
                    },
                    performance,
                    buildTarget,
                    false,
                );
                if (REDIRECT_FASTPATH && isRedirect(response)) {
                    const fastResponse = await createFastPathResponse(
                        response,
                        performance,
                        buildTarget,
                    );
                    return disposeReturn(fastResponse);
                }
                return disposeReturn(response);
            }
            performance.measure('cache-miss', { start: performance.now() });
        }
        performance.mark('upstream');
        const upstreamResponse = await fetch(upstreamUrl.toString(), {
            headers: cloneHeaders(req.headers, denyHeaders),
            redirect: 'manual',
        });
        performance.measure('upstream', 'upstream');
        let body = await upstreamResponse.text();
        if (isJsResponse(upstreamResponse)) {
            performance.mark('build');
            body = replaceOrigin(
                await toSystemjs(body, { banner: OUTPUT_BANNER }, config),
            );
            performance.measure('build', 'build');
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
            performance,
            buildTarget,
            !!(CACHE && (!isRedirect(upstreamResponse) || CACHE_REDIRECT)),
        );
        if (CACHE && REDIRECT_FASTPATH && isRedirect(response)) {
            const fastResponse = await createFastPathResponse(
                response,
                performance,
                buildTarget,
            );
            return disposeReturn(fastResponse);
        }
        return disposeReturn(response);
    };
}
