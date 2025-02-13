import { assertEquals } from '@std/assert';
import { assertSpyCalls, spy } from '@std/testing/mock';
import { loadSync as dotenvLoad } from '@std/dotenv';

import { createPurgeHandler } from './create-purge-handler.ts';
import { Config } from './types.ts';

dotenvLoad({ export: true });

const baseConfig: Config = {
    BASE_PATH: '/',
    CACHE_ENABLE: false,
    HOMEPAGE: 'https://home/page',
    UPSTREAM_ORIGIN: 'https://esm.sh/',
    OUTPUT_BANNER: '',
    WORKER_MAX: 4,
    WORKER_MIN: 2,
};
const SELF_ORIGIN = 'https://systemjs.test/';

Deno.test(
    'should return 200 when the form has a parseable "url" field',
    async (t) => {
        const cacheReturn = [
            new Request(`${SELF_ORIGIN}vue@3.3.2`),
            new Request(`${SELF_ORIGIN}vue@3.3.2&bundle`),
        ] as const;
        const cacheMock = {
            keys: spy(async (_req: Request | string) => {
                return cacheReturn;
            }),
            delete: spy(async (_req: Request) => true),
        };
        const config = { ...baseConfig };
        const handler = createPurgeHandler(
            config,
            cacheMock,
        );
        const body = new FormData();
        body.append('url', `${SELF_ORIGIN}vue@3.3.2`);
        const req = new Request(`${SELF_ORIGIN}_purge`, {
            method: 'POST',
            body,
        });
        const res = await handler(req);
        await t.step(
            'should call cache.delete for all the cache keys returned',
            async () => {
                assertSpyCalls(cacheMock.delete, 2);
            },
        );
        await t.step(
            'should respond with 200 code',
            async () => {
                assertEquals(res.status, 200);
            },
        );
    },
);

Deno.test(
    'should return 400 when the form has no parseable "url" field',
    async (t) => {
        const cacheReturn = [
            new Request(`${SELF_ORIGIN}vue@3.3.2`),
            new Request(`${SELF_ORIGIN}vue@3.3.2&bundle`),
        ] as const;
        const cacheMock = {
            keys: spy(async (_req: Request | string) => {
                return cacheReturn;
            }),
            delete: spy(async (_req: Request) => true),
        };
        const config = { ...baseConfig };
        const handler = createPurgeHandler(
            config,
            cacheMock,
        );
        const body = new FormData();
        body.append('url', '------------------------------');
        const req = new Request(`${SELF_ORIGIN}_purge`, {
            method: 'POST',
            body,
        });
        const res = await handler(req);
        await t.step(
            'should not call any cache method',
            async () => {
                assertSpyCalls(cacheMock.keys, 0);
                assertSpyCalls(cacheMock.delete, 0);
            },
        );
        await t.step(
            'should respond with 400 code',
            async () => {
                assertEquals(res.status, 400);
            },
        );
    },
);
