import type { Config } from './types.ts';
import type { CacheLike } from '@esroyo/web-cache-api-persistence';

export function createPurgeHandler(
    _config: Config,
    cache?: Pick<CacheLike, 'keys' | 'delete'>,
): (request: Request) => Promise<Response> {
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
    };
}
