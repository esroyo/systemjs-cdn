import { _internals, cloneHeaders } from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';
import { ulid } from '../deps.ts';

const markNames = [
    'body',
    'fetch1',
    'fetch2',
    'curl',
    'node',
    'tosystemjs',
    'total',
] as const;

export async function esmProxyRequestHandler(
    req: Request,
): Promise<Response | never> {
    const reqHash = ulid();
    const prefix = (name: string) => `${reqHash}-${name}`;
    markNames.forEach((name) => {
        const prefixedName = prefix(name);
        performance.clearMarks(prefixedName);
        performance.clearMeasures(prefixedName);
    });
    const mark = (name: typeof markNames[number]) =>
        performance.mark(prefix(name));
    const measure = (name: typeof markNames[number]) =>
        performance.measure(prefix(name), prefix(name));
    const buildDebugPerformance = () =>
        JSON.stringify([
            ...performance.getEntriesByType('measure').filter((entry) =>
                entry.name.startsWith(reqHash)
            ).map(({ name, duration, startTime }) => ({
                name: name.replace(`${reqHash}-`, ''),
                duration,
                startTime,
            })),
        ]);
    mark('total');
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
        headers.set('X-Real-Origin', finalUrl.origin);
        headers.set('X-Debug-Performance', buildDebugPerformance());
    };
    const selfOriginActual = `${selfUrl.origin}${basePath}`;
    const selfOriginFinal = `${finalUrl.origin}${basePath}`;
    const esmUrl = new URL(req.url.replace(selfOriginActual, ''), esmOrigin);
    const replaceOrigin = (() => {
        const esmOriginRegExp = new RegExp(esmOrigin, 'ig');
        return (str: string) => str.replace(esmOriginRegExp, selfOriginFinal);
    })();
    if (!!req.headers.get('X-Debug')) {
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
    mark('fetch1');
    let esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: req.headers,
        redirect: 'manual',
    });
    measure('fetch1');
    let redirectFailure = false;
    if (!esmResponse.ok) {
        const redirectDetectNoneOrFailure = async () => {
            redirectFailure = true;
            mark('fetch2');
            esmResponse = await _internals.fetch(esmUrl.toString(), {
                headers: req.headers,
            });
            measure('fetch2');
        };
        if (REDIRECT_DETECT === 'none') {
            await redirectDetectNoneOrFailure();
        } else {
            try {
                mark(REDIRECT_DETECT);
                const redirectPromise = REDIRECT_DETECT === 'curl'
                    ? _internals.curl(['-I', esmUrl.toString()])
                    : _internals.node(esmUrl.toString(), req.headers);
                const { statusCode, statusMessage, headers = [] } =
                    await redirectPromise;
                measure(REDIRECT_DETECT);
                const isRedirect = statusCode >= 300 && statusCode < 400;
                if (!isRedirect) {
                    return esmResponse;
                }
                const responseHeaders = cloneHeaders(headers, replaceOrigin);
                measure('total');
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
    mark('body');
    const esmCode = await esmResponse.text();
    measure('body');
    mark('tosystemjs');
    const systemjsCode = await toSystemjs(esmCode, { banner: OUTPUT_BANNER });
    measure('tosystemjs');
    const headers = cloneHeaders(esmResponse.headers.entries(), replaceOrigin);
    measure('total');
    finalizeHeaders(headers, redirectFailure);
    return new Response(
        replaceOrigin(systemjsCode),
        { headers },
    );
}
