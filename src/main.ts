import { config } from './global.ts'; // First always, and only once per process
import { type Route, route } from '@std/http';
import {
    type CacheLike,
    CachePersistenceDenoKv,
    CachePersistenceFactory,
    CachePersistenceRedis,
    CacheStorage,
} from '@esroyo/web-cache-api-persistence';

import { createWorkerPool } from './create-worker-pool.ts';
import { createMainHandler } from './create-main-handler.ts';
import { instrumentRequestHandler } from './instrument-request-handler.ts';
import { getBuildTarget } from './utils.ts';

let cache: CacheLike | undefined;
if (config.CACHE) {
    const headerNormalizer = (
        headerName: string,
        headerValue: string | null,
    ): string => {
        if (headerName === 'user-agent' && headerValue) {
            return getBuildTarget(headerValue)[0];
        }
        if (headerName === 'origin') {
            return '*';
        }
        return headerValue ?? '';
    };
    let persistenceFactory: CachePersistenceFactory | undefined;
    if (
        config.CACHE_REDIS_HOSTNAME &&
        config.CACHE_REDIS_PORT &&
        config.CACHE_REDIS_PASSWORD &&
        config.CACHE_REDIS_USERNAME
    ) {
        persistenceFactory = {
            create: async () =>
                new CachePersistenceRedis({
                    hostname: config.CACHE_REDIS_HOSTNAME!,
                    port: config.CACHE_REDIS_PORT,
                    username: config.CACHE_REDIS_USERNAME,
                    password: config.CACHE_REDIS_PASSWORD,
                    tls: config.CACHE_REDIS_TLS,
                    max: config.CACHE_CONN_MAX,
                    min: config.CACHE_CONN_MIN,
                }),
        };
    } else {
        persistenceFactory = {
            create: async () =>
                new CachePersistenceDenoKv({
                    consistency: 'eventual',
                    max: 4,
                    min: 2,
                }),
        };
    }

    const caches = new CacheStorage(persistenceFactory, headerNormalizer);
    cache = await caches.open('v1');
}

const workerPool = config.WORKER_ENABLE ? createWorkerPool(config) : undefined;

const basePathWithSlash = config.BASE_PATH === '/'
    ? config.BASE_PATH
    : `${config.BASE_PATH}/`;

const homeHandler = () =>
    new Response(null, {
        status: 302,
        headers: { 'location': config.HOMEPAGE },
    });
const mainHandler = createMainHandler(config, cache, workerPool);

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
const instrumentedHandler = instrumentRequestHandler(handler);

const server = Deno.serve({
    port: 8000,
    handler: instrumentedHandler,
});

server.finished.then(() => {
    console.log('Finishing server');
    return cache?.[Symbol.asyncDispose]?.();
}).then(() => {
    console.log('Finished');
});
