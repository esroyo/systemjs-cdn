import {
    _internals,
    cloneHeaders,
    createFinalResponse,
    denyHeaders,
    isJsResponse,
    retrieveCache,
} from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';
import { getBuildTargetFromUA, ScopedPerformance } from '../deps.ts';

export async function esmProxyRequestHandler(
    req: Request,
): Promise<Response> {
    const performance = new ScopedPerformance();
    performance.mark('total');
    const {
        BASE_PATH,
        CACHE_MAXAGE,
        ESM_ORIGIN,
        HOMEPAGE,
        OUTPUT_BANNER,
    } = await resolveConfig();
    const buildTarget = getBuildTargetFromUA(req.headers.get('user-agent'));
    if (Number(CACHE_MAXAGE)) {
        performance.mark('cache-read');
        const value = await retrieveCache(Deno.openKv(), [
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
                true,
            );
        }
    }
    performance.measure('cache-miss', { start: performance.now() });
    const selfUrl = new URL(req.url);
    const basePath = `/${BASE_PATH}/`.replace(/\/+/g, '/');
    const esmOrigin = `${ESM_ORIGIN}/`.replace(/\/+$/, '/');
    if ([`${basePath}`, '/', ''].includes(selfUrl.pathname)) {
        return Response.redirect(HOMEPAGE || esmOrigin, 302);
    }
    const finalUrl = new URL(req.headers.get('x-real-origin') ?? selfUrl);
    const selfOriginActual = `${selfUrl.origin}${basePath}`;
    const selfOriginFinal = `${finalUrl.origin}${basePath}`;
    const esmUrl = new URL(req.url.replace(selfOriginActual, ''), esmOrigin);
    const replaceOrigin = (() => {
        const esmOriginRegExp = new RegExp(esmOrigin, 'ig');
        const registerRegExp =
            /(?:register|import)\(\[?(?:['"][^'"]+['"](?:,\s*)?)*\]?/gm;
        const absolutePathRegExp = /['"][^'"]+['"]/gm;
        const absolutePathReplaceRegExp = /^(['"])\//;
        return (str: string) => {
            return str.replace(esmOriginRegExp, selfOriginFinal)
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
    const esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: cloneHeaders(req.headers, denyHeaders),
        redirect: 'manual',
    });
    performance.measure('upstream', 'upstream');
    let body = await esmResponse.text();
    if (isJsResponse(esmResponse)) {
        performance.mark('build');
        body = replaceOrigin(await toSystemjs(body, { banner: OUTPUT_BANNER }));
        performance.measure('build', 'build');
    }
    return createFinalResponse(
        {
            url: req.url,
            body,
            headers: cloneHeaders(
                esmResponse.headers,
                denyHeaders,
                replaceOriginHeaders,
            ),
            status: esmResponse.status,
            statusText: esmResponse.statusText,
        },
        performance,
        buildTarget,
        false,
    );
}
