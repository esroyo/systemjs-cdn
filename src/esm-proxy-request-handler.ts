import { _internals, cloneHeaders } from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';
import { ScopedPerformance } from '../deps.ts';

export async function esmProxyRequestHandler(
    req: Request,
): Promise<Response | never> {
    const scoped = new ScopedPerformance();
    const buildDebugPerformance = () => {
        const prefix = `${scoped.randomId}${scoped.glue}`;
        console.log(performance.getEntries());
        return JSON.stringify([
            ...scoped.getEntriesByType('measure').map(({ name, duration }) => ({
                name: name.replace(prefix, ''),
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
        REDIRECT_DETECT,
        REDIRECT_FAILURE_CACHE,
    } = await resolveConfig();
    const selfUrl = new URL(req.url);
    const basePath = `/${BASE_PATH}/`.replace(/\/+/g, '/');
    const esmOrigin = `${ESM_ORIGIN}/`.replace(/\/+$/, '/');
    if ([`${basePath}`, '/', ''].includes(selfUrl.pathname)) {
        return Response.redirect(HOMEPAGE || esmOrigin, 302);
    }
    const finalUrl = new URL(req.headers.get('X-Real-Origin') ?? selfUrl);
    const finalizeHeaders = (headers: Headers, lowCache = false): void => {
        if (lowCache) {
            headers.delete('Cache-Control');
            headers.set(
                'Cache-Control',
                `public, max-age=${REDIRECT_FAILURE_CACHE}`,
            );
        }
        headers.delete('X-Typescript-Types');
        headers.set('X-Debug-Performance', buildDebugPerformance());
    };
    const selfOriginActual = `${selfUrl.origin}${basePath}`;
    const selfOriginFinal = `${finalUrl.origin}${basePath}`;
    const esmUrl = new URL(req.url.replace(selfOriginActual, ''), esmOrigin);
    const replaceOrigin = (() => {
        const esmOriginRegExp = new RegExp(esmOrigin, 'ig');
        return (str: string) => str.replace(esmOriginRegExp, selfOriginFinal);
    })();
    if (req.headers.get('X-Debug') === '1') {
        return Response.json({
            BASE_PATH,
            ESM_ORIGIN,
            HOMEPAGE,
            OUTPUT_BANNER,
            REDIRECT_DETECT,
            REDIRECT_FAILURE_CACHE,
            selfUrl,
            basePath,
            esmOrigin,
            finalUrl,
            selfOriginFinal,
            esmUrl,
            xRealOrigin: req.headers.get('X-Real-Origin'),
        });
    }
    const reqHeaders = cloneHeaders(req.headers.entries());
    reqHeaders.delete('X-Real-Origin');
    reqHeaders.delete('X-Debug');
    scoped.mark('fetch1');
    let esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: reqHeaders,
        redirect: 'manual',
    });
    scoped.measure('fetch1', 'fetch1');
    let redirectFailure = false;
    if (!esmResponse.ok) {
        const redirectDetectNoneOrFailure = async () => {
            redirectFailure = true;
            scoped.mark('fetch2');
            esmResponse = await _internals.fetch(esmUrl.toString(), {
                headers: reqHeaders,
            });
            scoped.measure('fetch2', 'fetch2');
        };
        if (REDIRECT_DETECT === 'none') {
            await redirectDetectNoneOrFailure();
        } else {
            try {
                scoped.mark(REDIRECT_DETECT);
                const redirectPromise = REDIRECT_DETECT === 'curl'
                    ? _internals.curl(['-I', esmUrl.toString()])
                    : _internals.node(esmUrl.toString(), reqHeaders);
                const { statusCode, statusMessage, headers = [] } =
                    await redirectPromise;
                scoped.measure(REDIRECT_DETECT, REDIRECT_DETECT);
                const isRedirect = statusCode >= 300 && statusCode < 400;
                if (!isRedirect) {
                    return esmResponse;
                }
                const responseHeaders = cloneHeaders(headers, replaceOrigin);
                scoped.measure('total', 'total');
                finalizeHeaders(responseHeaders, redirectFailure);
                return new Response('', {
                    status: statusCode,
                    statusText: statusMessage,
                    headers: responseHeaders,
                });
            } catch (_error) {
                console.warn(_error);
                await redirectDetectNoneOrFailure();
            }
        }
    }
    scoped.mark('body');
    const esmCode = await esmResponse.text();
    scoped.measure('body', 'body');
    scoped.mark('tosystemjs');
    const systemjsCode = await toSystemjs(esmCode, { banner: OUTPUT_BANNER });
    scoped.measure('tosystemjs', 'tosystemjs');
    const headers = cloneHeaders(esmResponse.headers.entries(), replaceOrigin);
    scoped.measure('total', 'total');
    finalizeHeaders(headers, redirectFailure);
    const finalSystemjsCode = replaceOrigin(systemjsCode);
    if (req.headers.get('X-Debug') === '2') {
        return Response.json({
            BASE_PATH,
            ESM_ORIGIN,
            HOMEPAGE,
            OUTPUT_BANNER,
            REDIRECT_DETECT,
            REDIRECT_FAILURE_CACHE,
            selfUrl,
            basePath,
            esmOrigin,
            finalUrl,
            finalSystemjsCode,
            selfOriginFinal,
            systemjsCode,
            esmUrl,
            xRealOrigin: req.headers.get('X-Real-Origin'),
        });
    }
    return new Response(finalSystemjsCode, { headers });
}
