import { config } from './global.ts'; // First always, and only once per process
import { createCachePool } from './create-cache-pool.ts';
import { createWorkerPool } from './create-worker-pool.ts';
import { createRequestHandler } from './create-request-handler.ts';
import { instrumentRequestHandler } from './instrument-request-handler.ts';

const cachePool = config.CACHE ? createCachePool(config) : undefined;
const workerPool = config.WORKER_ENABLE ? createWorkerPool(config) : undefined;

Deno.serve(
    { port: 8000 },
    instrumentRequestHandler(
        createRequestHandler(config, cachePool, workerPool),
    ),
);
