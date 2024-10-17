import { config } from './global.ts'; // First always, and only once per process
import { createCachePool } from './create-cache-pool.ts';
import { createRequestHandler } from './create-request-handler.ts';
import { instrumentRequestHandler } from './instrument-request-handler.ts';

const cache = createCachePool(config);

Deno.serve(
    { port: 8000 },
    instrumentRequestHandler(createRequestHandler(config, cache)),
);
