import {
    _internals,
    cloneHeaders,
    createFinalResponse,
    denyHeaders,
    isJsResponse,
    retrieveCache,
} from './utils.ts';
import { denoKv } from './services.ts';
import { toSystemjs } from './to-systemjs.ts';
import { getBuildTargetFromUA, ScopedPerformance } from '../deps.ts';

export async function sjsRequestHandler(
    req: Request,
): Promise<Response> {
    const performance = new ScopedPerformance();
    performance.mark('total');
    const BASE_PATH = Deno.env.get('BASE_PATH');
    const CACHE = Deno.env.get('CACHE') === 'true';
    const UPSTREAM_ORIGIN = Deno.env.get('UPSTREAM_ORIGIN');
    const HOMEPAGE = Deno.env.get('HOMEPAGE');
    const OUTPUT_BANNER = Deno.env.get('OUTPUT_BANNER');
    const buildTarget = getBuildTargetFromUA(req.headers.get('user-agent'));
    if (CACHE) {
        performance.mark('cache-read');
        const value = await retrieveCache(denoKv, [
            req.url,
            buildTarget,
        ]);
        performance.measure('cache-read', 'cache-read');
        if (value) {
            performance.measure('cache-hit', { start: performance.now() });
            return createFinalResponse(
                {
                    ...value,
                    headers: new Headers(value.headers),
                },
                performance,
                buildTarget,
                false,
            );
        }
        performance.measure('cache-miss', { start: performance.now() });
    }
    const selfUrl = new URL(req.url);
    const basePath = `/${BASE_PATH}/`.replace(/\/+/g, '/');
    const upstreamOrigin = `${UPSTREAM_ORIGIN}/`.replace(/\/+$/, '/');
    if ([`${basePath}`, '/', ''].includes(selfUrl.pathname)) {
        return Response.redirect(HOMEPAGE || upstreamOrigin, 302);
    }
    const finalUrl = new URL(req.headers.get('x-real-origin') ?? selfUrl);
    const selfOriginActual = `${selfUrl.origin}${basePath}`;
    const selfOriginFinal = `${finalUrl.origin}${basePath}`;
    const upstreamUrl = new URL(
        req.url.replace(selfOriginActual, ''),
        upstreamOrigin,
    );
    const replaceOrigin = (() => {
        const upstreamOriginRegExp = new RegExp(upstreamOrigin, 'ig');
        const registerRegExp =
            /(?:register|import)\(\[?(?:['"][^'"]+['"](?:,\s*)?)*\]?/gm;
        const absolutePathRegExp = /['"][^'"]+['"]/gm;
        const absolutePathReplaceRegExp = /^(['"])\//;
        return (str: string) => {
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
    ) => (pair === null ? pair : [
        pair[0],
        typeof pair[1] === 'string' ? replaceOrigin(pair[1]) : pair[1],
    ] as [string, string]);
    performance.mark('upstream');
    const upstreamResponse = await _internals.fetch(upstreamUrl.toString(), {
        headers: cloneHeaders(req.headers, denyHeaders),
        redirect: 'manual',
    });
    performance.measure('upstream', 'upstream');
    let body = await upstreamResponse.text();
    if (isJsResponse(upstreamResponse)) {
        performance.mark('build');
        body = replaceOrigin(await toSystemjs(body, { banner: OUTPUT_BANNER }));
        performance.measure('build', 'build');
    }
    return createFinalResponse(
        {
            url: req.url,
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
        CACHE,
    );
}