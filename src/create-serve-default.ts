import { type Config } from './types.ts';
import { type Route, route } from '@std/http';
import { createCachePool } from './create-cache-pool.ts';
import { createWorkerPool } from './create-worker-pool.ts';
import { createMainHandler } from './create-main-handler.ts';
import { instrumentRequestHandler } from './instrument-request-handler.ts';

export async function createServeDefault(
    config: Config & { disableInstrumentation?: boolean },
) {
    const cachePool = config.CACHE ? createCachePool(config) : undefined;
    const workerPool = config.WORKER_ENABLE
        ? createWorkerPool(config)
        : undefined;

    const basePathWithSlash = config.BASE_PATH === '/'
        ? config.BASE_PATH
        : `${config.BASE_PATH}/`;

    const homeHandler = () =>
        new Response(null, {
            status: 302,
            headers: { 'location': config.HOMEPAGE },
        });
    const mainHandler = createMainHandler(config, cachePool, workerPool);

    // Step: define the routes and handlers
    const routes: Route[] = [
        {
            pattern: new URLPattern({ pathname: '/_health' }),
            handler: () => new Response(null, { status: 204 }),
        },
        {
            pattern: new URLPattern({ pathname: config.BASE_PATH }),
            handler: homeHandler,
        },
        {
            pattern: new URLPattern({ pathname: basePathWithSlash }),
            handler: homeHandler,
        },
        {
            pattern: new URLPattern({ pathname: `${basePathWithSlash}*` }),
            handler: mainHandler,
        },
    ];

    function defaultHandler(_req: Request) {
        return new Response('Not found', { status: 404 });
    }

    // Step: setup all routes and instrument the final request handler
    const handler = route(routes, defaultHandler);

    // Standard way to expose the function to be served, as in CloudFlare workers
    return {
        fetch: config.disableInstrumentation
            ? handler
            : instrumentRequestHandler(handler),
    } satisfies Deno.ServeDefaultExport;
}
