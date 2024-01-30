import { _internals, cloneHeaders } from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';
import { ScopedPerformance } from '../deps.ts';

const denyHeadersList = [
    'access-control-expose-headers',
    'age',
    'alt-svc',
    'cf-cache-status',
    'cf-ray',
    'content-length',
    'host',
    'nel',
    'report-to',
    'server',
    'x-content-source',
    'x-debug',
    'x-esm-id',
    'x-real-origin',
    'x-typescript-types',
];
const denyHeaders = (pair: [string, string] | null) => (pair !== null && denyHeadersList.includes(pair[0]) ? null : pair);

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
    const finalizeHeaders = (headers: Headers): void => {
        headers.set('x-debug-performance', buildDebugPerformance());
    };
    const selfOriginActual = `${selfUrl.origin}${basePath}`;
    const selfOriginFinal = `${finalUrl.origin}${basePath}`;
    const esmUrl = new URL(req.url.replace(selfOriginActual, ''), esmOrigin);
    const replaceOrigin = (() => {
        const esmOriginRegExp = new RegExp(esmOrigin, 'ig');
        return (str: string) => str.replace(esmOriginRegExp, selfOriginFinal);
    })();
    const replaceOriginHeaders = (pair: [string, string] | null) => (pair === null ? pair : [pair[0], typeof pair[1] === 'string' ? replaceOrigin(pair[1]) : pair[1]] as [string, string]);
    if (req.headers.get('x-debug') === '1') {
        return Response.json({
            BASE_PATH,
            ESM_ORIGIN,
            HOMEPAGE,
            OUTPUT_BANNER,
            selfUrl,
            basePath,
            esmOrigin,
            finalUrl,
            selfOriginFinal,
            esmUrl,
            xRealOrigin: req.headers.get('x-real-origin'),
        });
    }
    const reqHeaders = cloneHeaders(req.headers, denyHeaders);
    scoped.mark('fetch');
    let esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: reqHeaders,
        redirect: 'manual',
    });
    scoped.measure('fetch', 'fetch');
    if (!esmResponse.ok) {
        const isRedirect = esmResponse.status >= 300 && esmResponse.status < 400;
        if (!isRedirect) {
            return esmResponse;
        }
        const responseHeaders = cloneHeaders(esmResponse.headers, denyHeaders, replaceOriginHeaders);
        scoped.measure('total', 'total');
        finalizeHeaders(responseHeaders);
        return new Response('', {
            status: esmResponse.status,
            statusText: esmResponse.statusText,
            headers: responseHeaders,
        });
    }
    scoped.mark('body');
    const esmCode = await esmResponse.text();
    scoped.measure('body', 'body');
    scoped.mark('tosystemjs');
    const systemjsCode = await toSystemjs(esmCode, { banner: OUTPUT_BANNER });
    scoped.measure('tosystemjs', 'tosystemjs');
    const headers = cloneHeaders(esmResponse.headers, denyHeaders, replaceOriginHeaders);
    scoped.measure('total', 'total');
    finalizeHeaders(headers);
    const finalSystemjsCode = replaceOrigin(systemjsCode);
    if (req.headers.get('x-debug') === '2') {
        return Response.json({
            BASE_PATH,
            ESM_ORIGIN,
            HOMEPAGE,
            OUTPUT_BANNER,
            selfUrl,
            basePath,
            esmOrigin,
            finalUrl,
            finalSystemjsCode,
            selfOriginFinal,
            systemjsCode,
            esmUrl,
            xRealOrigin: req.headers.get('x-real-origin'),
        });
    }
    return new Response(finalSystemjsCode, { headers });
}
