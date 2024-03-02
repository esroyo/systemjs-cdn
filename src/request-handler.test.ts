import {
    assertEquals,
    assertSpyCallArg,
    assertSpyCalls,
    spy,
} from '../dev_deps.ts';
import { dotenvLoad } from '../deps.ts';

import { createRequestHandler } from './create-request-handler.ts';
import { Config } from './types.ts';

dotenvLoad({ export: true });

const baseConfig: Config = {
    BASE_PATH: '/',
    CACHE: false,
    HOMEPAGE: 'https://home/page',
    UPSTREAM_ORIGIN: 'https://esm.sh',
    OUTPUT_BANNER: '',
};
const SELF_ORIGIN = 'https://systemjs.test';

const fetchReturn = (
    body =
        `export * from "${baseConfig.UPSTREAM_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs";`,
) => (
    Promise.resolve(
        new Response(body, {
            headers: new Headers({
                'access-control-allow-origin': '*',
                'content-type': 'application/javascript; charset=utf-8',
            }),
        }),
    )
);

Deno.test('requestHandler', async (t) => {
    await t.step('should redirect to $HOMEPAGE on request empty', async () => {
        const handler = createRequestHandler(baseConfig);
        const req = new Request(SELF_ORIGIN);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
    });

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN keeping the parameters',
        async () => {
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
            await handler(req);
            assertSpyCallArg(
                fetchMock,
                0,
                0,
                `${baseConfig.UPSTREAM_ORIGIN}/foo?bundle`,
            );
        },
    );

    await t.step(
        'should handle $UPSTREAM_ORIGIN with ending slash',
        async () => {
            const UPSTREAM_ORIGIN = 'https://esm.sh/';
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    UPSTREAM_ORIGIN,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
            await handler(req);
            assertSpyCallArg(fetchMock, 0, 0, `https://esm.sh/foo?bundle`);
        },
    );

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN removing the $basePath',
        async () => {
            const BASE_PATH = '/sub-dir';
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/sub-dir/foo?bundle`);
            await handler(req);
            assertSpyCallArg(
                fetchMock,
                0,
                0,
                `${baseConfig.UPSTREAM_ORIGIN}/foo?bundle`,
            );
        },
    );

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN taking into account that `X-Real-Origin` and the current request URL may differ in origin',
        async () => {
            const BASE_PATH = '/sub-dir';
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/sub-dir/foo?bundle`, {
                headers: { 'X-Real-Origin': 'https://systemjs.sh/' },
            });
            await handler(req);
            assertSpyCallArg(
                fetchMock,
                0,
                0,
                `${baseConfig.UPSTREAM_ORIGIN}/foo?bundle`,
            );
        },
    );

    await t.step(
        'should forward the upstream response CORS headers back to the client',
        async () => {
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            assertEquals(res.headers.get('access-control-allow-origin'), '*');
        },
    );

    await t.step(
        'should return an string of code in systemjs format',
        async () => {
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res: Response = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(systemjsCode.startsWith('System.register('), true);
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the self host',
        async () => {
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${SELF_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists',
        async () => {
            const fetchMock = spy(() => fetchReturn());
            const realOrigin = 'https://public.proxy.com';
            const req = new Request(`${SELF_ORIGIN}/vue`, {
                headers: { 'X-Real-Origin': realOrigin },
            });
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(`${realOrigin}/stable/vue@3.3.2/es2022/vue.mjs`),
                ),
                true,
            );
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the self host including $basePath',
        async () => {
            const BASE_PATH = '/sub-dir/234';
            const fetchMock = spy(() => fetchReturn());
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${SELF_ORIGIN}/sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
        },
    );

    await t.step(
        'should prefix the absolute paths (missing $UPSTREAM_ORIGIN) with the $basePath',
        async () => {
            const BASE_PATH = '/sub-dir/234';
            const fetchMock = spy(() =>
                fetchReturn(`
import "/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs";
export const foo = () => import("/stable/monaco-editor@0.45.0/es2022/monaco-editor.css");
export const bar = () => import("https://unpkg.com/systemjs/dist/s.js");
export * from "/stable/vue@3.3.4/es2022/vue.mjs";
`)
            );
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/sub-dir/234/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs'",
                    ),
                ),
                true,
            );
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/sub-dir/234/stable/vue@3.3.4/es2022/vue.mjs'",
                    ),
                ),
                true,
            );
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/sub-dir/234/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'",
                    ),
                ),
                true,
            );
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'https://unpkg.com/systemjs/dist/s.js'",
                    ),
                ),
                true,
            );
        },
    );

    await t.step(
        'should do nothing to the absolute paths (missing $UPSTREAM_ORIGIN) when the $basePath is empty',
        async () => {
            const BASE_PATH = '';
            const fetchMock = spy(() =>
                fetchReturn(`
import "/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs";
export * from "/stable/vue@3.3.4/es2022/vue.mjs";
`)
            );
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs'",
                    ),
                ),
                true,
            );
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/stable/vue@3.3.4/es2022/vue.mjs'",
                    ),
                ),
                true,
            );
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists including $basePath',
        async () => {
            const BASE_PATH = '/sub-dir/234';
            const fetchMock = spy(() => fetchReturn());
            const realOrigin = 'https://public.proxy.com';
            const req = new Request(`${SELF_ORIGIN}/vue`, {
                headers: { 'X-Real-Origin': realOrigin },
            });
            const handler = createRequestHandler(
                {
                    ...baseConfig,
                    BASE_PATH,
                },
                undefined,
                fetchMock,
            );
            const res = await handler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${realOrigin}/sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
        },
    );

    await t.step(
        'should return a redirect reponse with the replaced "Location:" header when ESM_SERVICE_HOST responds with >= 300 < 400 status',
        async () => {
            const fetchMock = spy(async () =>
                new Response('', {
                    status: 302,
                    headers: {
                        'Location':
                            `${baseConfig.UPSTREAM_ORIGIN}/stable/vue@3.3.2`,
                    },
                })
            );
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            assertEquals(res.status, 302);
            assertEquals(
                res.headers.get('location'),
                `${SELF_ORIGIN}/stable/vue@3.3.2`,
            );
            assertSpyCalls(fetchMock, 1);
        },
    );

    await t.step(
        'should return the original reponse "as-is" when ESM_SERVICE_HOST responds with a !ok status other than >= 300 < 400',
        async () => {
            const fetchMock = spy(async () =>
                new Response('', { status: 404 })
            );
            const handler = createRequestHandler(
                baseConfig,
                undefined,
                fetchMock,
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await handler(req);
            assertEquals(res.status, 404);
            assertSpyCalls(fetchMock, 1);
        },
    );
});
