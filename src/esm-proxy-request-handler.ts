import {
    _internals,
    cloneHeaders,
    denyHeaders,
    handleResponse,
    isJsResponse,
    isTestEnv,
    isValidCacheEntry,
} from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';
import {
    kvGet,
    ScopedPerformance,
} from '../deps.ts';

export async function esmProxyRequestHandler(
    req: Request,
): Promise<Response> {
    const scoped = new ScopedPerformance();
    const buildDebugPerformance = () => {
        return JSON.stringify([
            ...scoped.getEntriesByType('measure').map(({ name, duration }) => ({
                name,
                duration,
            })),
        ]);
    };
    scoped.mark('total');
    if (!isTestEnv()) {
        const kv = await Deno.openKv();
        const blob = await kvGet(kv, ['cache', req.url]);
        const value = blob && JSON.parse(new TextDecoder().decode(blob));
        kv.close();
        if (isValidCacheEntry(value)) {
            const headers = new Headers(value.headers);
            scoped.measure('total', 'total');
            headers.set('x-debug-performance', buildDebugPerformance());
            return handleResponse({
                ...value,
                headers,
            }, false);
        }
    }
    const {
        BASE_PATH,
        ESM_ORIGIN,
        HOMEPAGE,
        OUTPUT_BANNER,
    } = await resolveConfig();
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
        const registerRegExp = /register\(\[(?:['"][^'"]+['"](?:,\s*)?)*\],/gm;
        const absolutePathRegExp = /['"][^'"]+['"]/gm;
        const absolutePathReplaceRegExp = /^(['"])\//;
        return (str: string) => {
            return str.replace(esmOriginRegExp, selfOriginFinal)
                .replace(registerRegExp, (registerMatch) => {
                    return registerMatch.replace(absolutePathRegExp, (absolutePathMatch) => {
                        return absolutePathMatch.replace(absolutePathReplaceRegExp, `$1${basePath}`);
                    });
                });
        }
    })();
    const replaceOriginHeaders = (pair: [string, string] | null) => (pair === null ? pair : [pair[0], typeof pair[1] === 'string' ? replaceOrigin(pair[1]) : pair[1]] as [string, string]);
    const reqHeaders = cloneHeaders(req.headers, denyHeaders);
    scoped.mark('fetch');
    const esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: reqHeaders,
        redirect: 'manual',
    });
    scoped.measure('fetch', 'fetch');
    let body = await esmResponse.text();
    if (isJsResponse(esmResponse)) {
        scoped.mark('tosystemjs');
        body = replaceOrigin(await toSystemjs(body, { banner: OUTPUT_BANNER }));
        scoped.measure('tosystemjs', 'tosystemjs');
    }
    const headers = cloneHeaders(esmResponse.headers, denyHeaders, replaceOriginHeaders);
    scoped.measure('total', 'total');
    headers.set('x-debug-performance', buildDebugPerformance());
    return handleResponse({
        url: req.url,
        body,
        headers,
        status: esmResponse.status,
        statusText: esmResponse.statusText,
    });
}
