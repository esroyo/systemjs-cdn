import { assertEquals } from '@std/assert';
import { loadSync as dotenvLoad } from '@std/dotenv';

import { createServeDefault } from './create-serve-default.ts';
import { Config } from './types.ts';

dotenvLoad({ export: true });

const baseConfig: Config & { disableInstrumentation?: boolean } = {
    disableInstrumentation: true,
    BASE_PATH: '/',
    CACHE: false,
    HOMEPAGE: 'https://home/page',
    UPSTREAM_ORIGIN: 'https://esm.sh/',
    OUTPUT_BANNER: '',
    WORKER_MAX: 4,
    WORKER_MIN: 2,
};
const SELF_ORIGIN = 'https://systemjs.test/';

Deno.test('should redirect to $HOMEPAGE on request empty', async () => {
    const handler = (await createServeDefault(baseConfig)).fetch;
    const req = new Request(SELF_ORIGIN);
    const res = await handler(req);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
});

Deno.test('should redirect to $HOMEPAGE on request empty (with BASE_PATH)', async () => {
    const config = {
        ...baseConfig,
        BASE_PATH: '/sub-dir',
    };
    const handler = (await createServeDefault(config)).fetch;
    const req = new Request(`${SELF_ORIGIN}sub-dir`);
    const res = await handler(req);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
});

Deno.test('should return a 404 when the request is impossible (smaller than BASE_PATH length)', async () => {
    const config = {
        ...baseConfig,
        BASE_PATH: '/sub-dir',
    };
    const handler = (await createServeDefault(config)).fetch;
    const req = new Request(SELF_ORIGIN);
    const res = await handler(req);
    assertEquals(res.status, 404);
});
