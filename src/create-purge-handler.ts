import type { Config } from './types.ts';
import type { CacheLike } from '@esroyo/web-cache-api-persistence';

export function createPurgeHandler(
    config: Config,
    cache?: Pick<CacheLike, 'keys' | 'delete'>,
): (request: Request) => Promise<Response> {
    const { BASE_PATH } = config;

    return async function requestHandler(
        request: Request,
    ): Promise<Response> {
        const formData = await request.formData();
        const url = formData.get('url') as string;

        if (url && URL.canParse(url) && cache) {
            for (
                const cachedRequest of await cache.keys(url, {
                    ignoreMethod: true,
                    ignoreVary: true,
                    ignoreSearch: true,
                })
            ) {
                await cache.delete(cachedRequest);
            }
            return new Response(null, { status: 200, statusText: 'OK' });
        }
        return new Response(null, { status: 400, statusText: 'Bad Request' });

        /*
        const pkg = formData.get('pkg');

        if (!pkg) {
            return new Response(null, { status: 400, statusText: 'Bad Request' });
        }

        const version = formData.get('version');
        const pkgRegExp = new RegExp(`${BASE_PATH === '/' ? '' : BASE_PATH}\\/((stable|v\\d\\d\\d)\\/|\\*)?${pkg}${version ? `@${version}` : ''}`);
        if (cache) {
            // @ts-ignore
            for await (const [cachedRequest] of cache._persistence[Symbol.asyncIterator](cache._cacheName)) {
                if (pkgRegExp.test(cachedRequest.url)) {
                    await cache.delete(cachedRequest);
                }
            }
        }

        return new Response(null, { status: 200, statusText: 'OK' });

        */
    };
}
