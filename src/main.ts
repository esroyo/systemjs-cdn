import { config } from './global.ts'; // First always, and only once per process
import { createServeDefault } from './create-serve-default.ts';

const serveDefault = await createServeDefault(config);

Deno.serve(
    { port: 8000 },
    serveDefault.fetch,
);
