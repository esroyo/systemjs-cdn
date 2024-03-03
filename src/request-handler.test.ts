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

Deno.test('should redirect to $HOMEPAGE on request empty', async () => {
    const handler = createRequestHandler(baseConfig);
    const req = new Request(SELF_ORIGIN);
    const res = await handler(req);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
});

Deno.test('should forward the request to $UPSTREAM_ORIGIN keeping the parameters', async () => {
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
});

Deno.test('should handle $UPSTREAM_ORIGIN with ending slash', async () => {
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
});

Deno.test('should forward the request to $UPSTREAM_ORIGIN removing the $BASE_PATH', async () => {
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
});

Deno.test('should take into account that `X-Real-Origin` and the current request URL may differ in origin', async () => {
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
});

Deno.test(
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

Deno.test('should return an string of code in systemjs format', async () => {
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
});

Deno.test('should replace the $UPSTREAM_ORIGIN by the self host', async () => {
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
});

Deno.test('should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists', async () => {
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
});

Deno.test(
    'should replace the $UPSTREAM_ORIGIN by the self host including $BASE_PATH',
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

Deno.test(
    'should prefix the absolute paths (missing $UPSTREAM_ORIGIN) with the $BASE_PATH',
    async (t) => {
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
        await t.step(
            'should add the $BASE_PATH to the aboslute static import',
            () => {
                assertEquals(
                    !!systemjsCode.match(
                        new RegExp(
                            "'/sub-dir/234/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs'",
                        ),
                    ),
                    true,
                );
            },
        );
        await t.step('should add the $BASE_PATH to the aboslute export', () => {
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        "'/sub-dir/234/stable/vue@3.3.4/es2022/vue.mjs'",
                    ),
                ),
                true,
            );
        });
        await t.step(
            'should add the $BASE_PATH to the aboslute dynamic import',
            () => {
                assertEquals(
                    !!systemjsCode.match(
                        new RegExp(
                            "'/sub-dir/234/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'",
                        ),
                    ),
                    true,
                );
            },
        );
        await t.step(
            'should NOT add the $BASE_PATH to the full-url dynamic import',
            () => {
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
    },
);

Deno.test(
    'should do nothing to the absolute paths (missing $UPSTREAM_ORIGIN) when the $BASE_PATH is empty',
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

Deno.test(
    'should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists including $BASE_PATH',
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

Deno.test(
    'should return a redirect response with the replaced "Location:" header when UPSTREAM_ORIGIN responds with >= 300 < 400 status',
    async () => {
        const fetchMock = spy(async () =>
            new Response(
                `<a href="${baseConfig.UPSTREAM_ORIGIN}/vue@3.3.2">Found</a>.`,
                {
                    status: 302,
                    headers: {
                        'Location': `${baseConfig.UPSTREAM_ORIGIN}/vue@3.3.2`,
                    },
                },
            )
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
            `${SELF_ORIGIN}/vue@3.3.2`,
        );
        assertEquals(
            await res.text(),
            `<a href="${SELF_ORIGIN}/vue@3.3.2">Found</a>.`,
        );
        assertSpyCalls(fetchMock, 1);
    },
);

Deno.test(
    'should return the original reponse "as-is" when UPSTREAM_ORIGIN responds with a !ok status other than >= 300 < 400',
    async () => {
        const fetchMock = spy(async () => new Response('', { status: 404 }));
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
