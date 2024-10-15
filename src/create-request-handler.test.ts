import {
    assertEquals,
    assertSpyCallArg,
    assertSpyCalls,
    spy,
} from '../dev_deps.ts';
import { dotenvLoad } from '../deps.ts';

import { createCachePool } from './create-cache-pool.ts';
import { createRequestHandler } from './create-request-handler.ts';
import { Config, ResponseProps } from './types.ts';

dotenvLoad({ export: true });

const baseConfig: Config = {
    BASE_PATH: '/',
    CACHE: false,
    HOMEPAGE: 'https://home/page',
    UPSTREAM_ORIGIN: 'https://esm.sh/',
    OUTPUT_BANNER: '',
};
const SELF_ORIGIN = 'https://systemjs.test/';

const fetchReturn = (
    body =
        `export * from "${baseConfig.UPSTREAM_ORIGIN}stable/vue@3.3.2/es2022/vue.mjs";`,
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

Deno.test('should redirect to bare $UPSTREAM_ORIGIN on request empty if $HOMEPAGE is falsy', async () => {
    const config = {
        ...baseConfig,
        HOMEPAGE: '',
    };
    const handler = createRequestHandler(config);
    const req = new Request(SELF_ORIGIN);
    const res = await handler(req);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), baseConfig.UPSTREAM_ORIGIN);
});

Deno.test('should forward the request to $UPSTREAM_ORIGIN keeping the parameters', async () => {
    const fetchMock = spy(() => fetchReturn());
    const handler = createRequestHandler(
        baseConfig,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}foo?bundle`);
    await handler(req);
    assertSpyCallArg(
        fetchMock,
        0,
        0,
        `${baseConfig.UPSTREAM_ORIGIN}foo?bundle`,
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
    const req = new Request(`${SELF_ORIGIN}foo?bundle`);
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
    const req = new Request(`${SELF_ORIGIN}sub-dir/foo?bundle`);
    await handler(req);
    assertSpyCallArg(
        fetchMock,
        0,
        0,
        `${baseConfig.UPSTREAM_ORIGIN}foo?bundle`,
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
    const req = new Request(`${SELF_ORIGIN}sub-dir/foo?bundle`, {
        headers: { 'X-Real-Origin': 'https://systemjs.sh/' },
    });
    await handler(req);
    assertSpyCallArg(
        fetchMock,
        0,
        0,
        `${baseConfig.UPSTREAM_ORIGIN}foo?bundle`,
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
        const req = new Request(`${SELF_ORIGIN}vue`);
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
    const req = new Request(`${SELF_ORIGIN}vue`);
    const res: Response = await handler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), true);
});

Deno.test('should avoid the systemjs transpilation when "raw" param exists', async () => {
    const fetchMock = spy(() => fetchReturn());
    const handler = createRequestHandler(
        baseConfig,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}vue?raw`);
    const res: Response = await handler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), false);
});

Deno.test('should return an string of code in systemjs format (WORKER_ENABLE)', async () => {
    const fetchMock = spy(() => fetchReturn());
    const config = {
        ...baseConfig,
        WORKER_ENABLE: true,
    };
    const handler = createRequestHandler(
        config,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}vue`);
    const res: Response = await handler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), true);
    assertEquals(systemjsCode.endsWith(' - (worker) */\n'), true);
});

Deno.test('should replace the $UPSTREAM_ORIGIN by the self host', async () => {
    const fetchMock = spy(() => fetchReturn());
    const handler = createRequestHandler(
        baseConfig,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}vue`);
    const res = await handler(req);
    const systemjsCode = await res.text();
    assertEquals(
        !!systemjsCode.match(
            new RegExp(
                `${SELF_ORIGIN}stable/vue@3.3.2/es2022/vue.mjs`,
            ),
        ),
        true,
    );
});

Deno.test('should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists', async () => {
    const fetchMock = spy(() => fetchReturn());
    const realOrigin = 'https://public.proxy.com/';
    const req = new Request(`${SELF_ORIGIN}vue`, {
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
            new RegExp(`${realOrigin}stable/vue@3.3.2/es2022/vue.mjs`),
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
        const req = new Request(`${SELF_ORIGIN}vue`);
        const res = await handler(req);
        const systemjsCode = await res.text();
        assertEquals(
            !!systemjsCode.match(
                new RegExp(
                    `${SELF_ORIGIN}sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
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
        const req = new Request(`${SELF_ORIGIN}vue`);
        const res = await handler(req);
        const systemjsCode = await res.text();
        await t.step(
            'should add the $BASE_PATH to the absolute static import',
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
        await t.step('should add the $BASE_PATH to the absolute export', () => {
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
            'should add the $BASE_PATH to the absolute dynamic import',
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
        const BASE_PATH = '/';
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
        const req = new Request(`${SELF_ORIGIN}vue`);
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
        const realOrigin = 'https://public.proxy.com/';
        const req = new Request(`${SELF_ORIGIN}vue`, {
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
                    `${realOrigin}sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
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
                `<a href="${baseConfig.UPSTREAM_ORIGIN}vue@3.3.2">Found</a>.`,
                {
                    status: 302,
                    headers: {
                        'Location': `${baseConfig.UPSTREAM_ORIGIN}vue@3.3.2`,
                    },
                },
            )
        );
        const handler = createRequestHandler(
            baseConfig,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}vue`);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(
            res.headers.get('location'),
            `${SELF_ORIGIN}vue@3.3.2`,
        );
        assertEquals(
            await res.text(),
            `<a href="${SELF_ORIGIN}vue@3.3.2">Found</a>.`,
        );
        assertSpyCalls(fetchMock, 1);
    },
);

Deno.test(
    'should return the original reponse "as-is" when $UPSTREAM_ORIGIN responds with a !ok status other than >= 300 < 400',
    async () => {
        const fetchMock = spy(async () => new Response('', { status: 404 }));
        const handler = createRequestHandler(
            baseConfig,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}vue`);
        const res = await handler(req);
        assertEquals(res.status, 404);
        assertSpyCalls(fetchMock, 1);
    },
);

Deno.test(
    'should return the cached response if exists',
    async (t) => {
        const fetchMock = spy(() => fetchReturn());
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => ({
                url: `${SELF_ORIGIN}foo?bundle`,
                body: '/* cached */',
                headers: new Headers(),
                status: 200,
                statusText: 'OKIE',
            })),
            set: spy(async () => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.get, 1);
        });
        await t.step(
            'should build the response based on the cached value',
            async () => {
                assertEquals(await res.text(), '/* cached */');
                assertEquals(res.status, 200);
                assertEquals(res.statusText, 'OKIE');
            },
        );
        await t.step('should not fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 0);
        });
        await t.step('should not set anything in the cache', async () => {
            assertSpyCalls(cacheMock.set, 0);
        });
    },
);

Deno.test(
    'should fetch $UPSTREAM_ORIGIN if there is no cached response',
    async (t) => {
        const upstreamBody = 'export const foobar = 1;';
        const fetchMock = spy(() => fetchReturn(upstreamBody));
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => null),
            set: spy(async (_key: string[], _res: ResponseProps) => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.get, 1);
        });
        await t.step('should fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 1);
        });
        await t.step('should set the response in the cache', async () => {
            assertSpyCalls(cacheMock.set, 1);
            const spyCall = cacheMock.set.calls[0];
            const secondArg = spyCall && spyCall.args[1];
            assertEquals(secondArg.url, `${SELF_ORIGIN}foo?bundle`);
            assertEquals(secondArg.body.includes('const foobar'), true);
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should fast-path the contents of the redirect location if those exist in cache',
    async (t) => {
        const cacheReturns = [{
            url: `${SELF_ORIGIN}foo?bundle`,
            body: '',
            headers: new Headers({
                location: `${SELF_ORIGIN}foo@2?bundle`,
            }),
            status: 302,
            statusText: 'Redirect',
        }, {
            url: `${SELF_ORIGIN}foo@2?bundle`,
            body: '/* cached */',
            headers: new Headers(),
            status: 200,
            statusText: 'OKIE',
        }];
        const fetchMock = spy(() => fetchReturn());
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => {
                return cacheReturns.shift() || null;
            }),
            set: spy(async () => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
            REDIRECT_FASTPATH: true,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.get, 2);
        });
        await t.step(
            'should build the response based on the cached value',
            async () => {
                assertEquals(await res.text(), '/* cached */');
                assertEquals(res.status, 200);
                assertEquals(res.statusText, 'OKIE');
            },
        );
        await t.step('should not fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 0);
        });
        await t.step('should not set anything in the cache', async () => {
            assertSpyCalls(cacheMock.set, 0);
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should make a fresh fetch from upstream if those do not exist in cache',
    async (t) => {
        const cacheReturns = [{
            url: `${SELF_ORIGIN}foo?bundle`,
            body: '',
            headers: new Headers({
                location: `${SELF_ORIGIN}foo@2?bundle`,
            }),
            status: 302,
            statusText: 'Redirect',
        }];
        const fetchMock = spy(() => fetchReturn('/* fresh */'));
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => {
                return cacheReturns.shift() || null;
            }),
            set: spy(async () => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
            CACHE_CLIENT_REDIRECT: 60,
            REDIRECT_FASTPATH: true,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.get, 2);
        });
        await t.step('should fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 1);
        });
        await t.step(
            'should respond with the fresh contents',
            async () => {
                assertEquals((await res.text()).includes('/* fresh */'), true);
            },
        );
        await t.step(
            'should overwritte cache-control with $CACHE_CLIENT_REDIRECT',
            async () => {
                assertEquals(
                    res.headers.get('cache-control'),
                    `public, max-age=${config.CACHE_CLIENT_REDIRECT}`,
                );
            },
        );
        await t.step('should set the fresh content in the cache', async () => {
            assertSpyCalls(cacheMock.set, 1);
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should return the redirect as-is if Location response header is missing',
    async (t) => {
        const cacheReturns = [{
            url: `${SELF_ORIGIN}foo?bundle`,
            body: '',
            headers: new Headers(),
            status: 302,
            statusText: 'Redirect',
        }];
        const fetchMock = spy(() => fetchReturn());
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => {
                return cacheReturns.shift() || null;
            }),
            set: spy(async () => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
            CACHE_CLIENT_REDIRECT: 600,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.get, 1);
        });
        await t.step(
            'should respond with the redirect as-is',
            async () => {
                assertEquals(res.status, 302);
                assertEquals(res.statusText, 'Redirect');
                assertEquals(
                    res.headers.get('location'),
                    null,
                );
            },
        );
        await t.step('should not fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 0);
        });
        await t.step('should not set anything in the cache', async () => {
            assertSpyCalls(cacheMock.set, 0);
        });
    },
);

Deno.test(
    'when $UPSTREAM_ORIGIN response is a redirect > should fast-path the contents of the redirect location if those exist in cache',
    async (t) => {
        const cacheReturns = [
            null,
            {
                url: `${SELF_ORIGIN}foo@2?bundle`,
                body: '/* cached */',
                headers: new Headers(),
                status: 200,
                statusText: 'OKIE',
            },
        ];
        const fetchMock = spy(() =>
            Promise.resolve(
                new Response('', {
                    headers: new Headers({
                        'location': `${baseConfig.UPSTREAM_ORIGIN}foo@2?bundle`,
                    }),
                    status: 302,
                    statusText: 'Redirect',
                }),
            )
        );
        const cacheMock = {
            close: spy(async () => {}),
            get: spy(async () => {
                return cacheReturns.shift() || null;
            }),
            set: spy(async () => {}),
        };
        const config = {
            ...baseConfig,
            CACHE: true,
            CACHE_REDIRECT: 600,
            REDIRECT_FASTPATH: true,
        };
        const cachePoolMock = createCachePool(
            config,
            undefined,
            () => cacheMock,
        );
        const handler = createRequestHandler(
            config,
            cachePoolMock,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step(
            'should try to get from the cache a total of two times',
            async () => {
                assertSpyCalls(cacheMock.get, 2);
            },
        );
        await t.step(
            'should build the final response based on the cached value',
            async () => {
                assertEquals(await res.text(), '/* cached */');
                assertEquals(res.status, 200);
                assertEquals(res.statusText, 'OKIE');
            },
        );
        await t.step(
            'should fetch $UPSTREAM_ORIGIN the first time',
            async () => {
                assertSpyCalls(fetchMock, 1);
            },
        );
        await t.step('should set in the cache 1 time', async () => {
            assertSpyCalls(cacheMock.set, 1);
        });
    },
);
