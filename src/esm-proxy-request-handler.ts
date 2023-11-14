import { _internals } from './utils.ts';
import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';

export async function esmProxyRequestHandler(
    req: Request,
): Promise<Response | never> {
    const {
        BASE_PATH,
        ESM_ORIGIN,
        HOMEPAGE,
        OUTPUT_BANNER,
    } = await resolveConfig();
    const selfUrl = new URL(req.url);
    const basePath = `/${BASE_PATH}/`.replace(/\/+/g, '/');
    const esmOrigin = `${ESM_ORIGIN}/`.replace(/\/+$/, '/');
    if (selfUrl.pathname === `${basePath}`) {
        return Response.redirect(HOMEPAGE || esmOrigin, 302);
    }
    const selfOrigin = `${selfUrl.origin}${basePath}`;
    const esmUrl = new URL(req.url.replace(selfOrigin, ''), esmOrigin);
    const replaceOrigin = (() => {
        const esmOriginRegExp = new RegExp(esmOrigin, 'ig');
        return (str: string) => str.replace(esmOriginRegExp, selfOrigin);
    })();
    let esmResponse = await _internals.fetch(esmUrl.toString(), {
        headers: req.headers,
        redirect: 'manual',
    });
    let avoidCache = false;
    if (!esmResponse.ok) {
        try {
            const { statusCode, statusMessage, headers = [] } = await _internals
                .curl(
                    ['-I', esmUrl.toString()],
                );
            //const { statusCode, statusMessage, headers = [] } = await _internals.head(esmUrl.toString(), req.headers);

            const isRedirect = statusCode >= 300 && statusCode < 400;
            if (!isRedirect) {
                return esmResponse;
            }
            return new Response('', {
                status: statusCode,
                statusText: statusMessage,
                headers: Object.fromEntries(
                    Object.values(headers).map((
                        { name, value },
                    ) => (value ? [name, replaceOrigin(value)] : [name])),
                ),
            });
        } catch (_error) {
            avoidCache = true;
            esmResponse = await _internals.fetch(esmUrl.toString(), {
                headers: req.headers,
            });
        }
    }
    const esmCode = await esmResponse.text();
    const systemjsCode = await toSystemjs(esmCode, { banner: OUTPUT_BANNER });
    let headers = esmResponse.headers;
    if (avoidCache) {
        headers = new Headers(esmResponse.headers);
        headers.delete('Cache-Control');
        headers.set('Cache-Control', 'public, max-age=600');
    }
    return new Response(
        replaceOrigin(systemjsCode),
        { headers },
    );
}
