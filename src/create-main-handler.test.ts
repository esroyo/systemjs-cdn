import { assertEquals, assertInstanceOf } from '@std/assert';
import { assertSpyCallArg, assertSpyCalls, spy } from '@std/testing/mock';
import { loadSync as dotenvLoad } from '@std/dotenv';

import { createMainHandler } from './create-main-handler.ts';
import { Config } from './types.ts';
import { createWorkerPool } from './create-worker-pool.ts';

dotenvLoad({ export: true });

const baseConfig: Config = {
    BASE_PATH: '/',
    CACHE_ENABLE: false,
    CACHE_NAME: 'v1',
    HOMEPAGE: 'https://home/page',
    UPSTREAM_ORIGIN: 'https://esm.sh/',
    OUTPUT_BANNER: '',
    WORKER_MAX: 4,
    WORKER_MIN: 2,
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

Deno.test('should return 302 to HOMEPAGE when the request is empty (with BASE_PATH)', async () => {
    const config = {
        ...baseConfig,
        BASE_PATH: '/sub-dir',
    };
    const handler = createMainHandler(config);
    {
        const req = new Request(`${SELF_ORIGIN}sub-dir//`);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
    }
    {
        const req = new Request(`${SELF_ORIGIN}sub-dir/`);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
    }
});

Deno.test('should return 302 to HOMEPAGE when the request is empty (without BASE_PATH)', async () => {
    const handler = createMainHandler(baseConfig);
    {
        const req = new Request(`${SELF_ORIGIN}/`);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
    }
    {
        const req = new Request(`${SELF_ORIGIN}`);
        const res = await handler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), baseConfig.HOMEPAGE);
    }
});

Deno.test('should forward the request to $UPSTREAM_ORIGIN keeping the parameters', async () => {
    const fetchMock = spy(() => fetchReturn());
    const handler = createMainHandler(
        baseConfig,
        undefined,
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

Deno.test('should abort the upstream fetch when the request is aborted', async () => {
    // This fetch will never resolve, will reject when the input signal is aborted
    const fetchMock = spy((_url: RequestInfo | URL, init?: RequestInit) => {
        const deferred = Promise.withResolvers<Response>();
        init?.signal?.addEventListener('abort', async (ev: Event) => {
            deferred.reject((ev.target as AbortSignal).reason);
        });
        return deferred.promise;
    });
    const handler = createMainHandler(
        baseConfig,
        undefined,
        undefined,
        fetchMock,
    );
    const abortController = new AbortController();
    const req = new Request(`${SELF_ORIGIN}foo?bundle`, {
        signal: abortController.signal,
    });
    const handlerResultPromise = handler(req);
    assertSpyCallArg(
        fetchMock,
        0,
        0,
        `${baseConfig.UPSTREAM_ORIGIN}foo?bundle`,
    );
    assertInstanceOf(fetchMock.calls[0]?.args[1]?.signal, AbortSignal);
    abortController.abort(new Error('Foobar'));
    // abortController.abort(new DOMException('The request has been cancelled.', 'AbortError'));
    await handlerResultPromise.catch((reason) => {
        assertEquals(reason.message, 'Foobar');
    });
});

Deno.test('should replace the user-agent when requesting to $UPSTREAM_ORIGIN if browser is unknown', async () => {
    const fetchMock = spy((() => fetchReturn()) as typeof globalThis.fetch);
    const handler = createMainHandler(
        baseConfig,
        undefined,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}foo?bundle`, {
        headers: { 'user-agent': 'potato' },
    });
    await handler(req);
    assertEquals(
        (fetchMock.calls?.[0]?.args?.[1]?.headers as Headers).get('user-agent'),
        'HeadlessChrome/52',
    );
});

Deno.test('should NOT replace the user-agent when requesting to $UPSTREAM_ORIGIN if browser is known', async () => {
    const fetchMock = spy((() => fetchReturn()) as typeof globalThis.fetch);
    const handler = createMainHandler(
        baseConfig,
        undefined,
        undefined,
        fetchMock,
    );
    const knownUserAgent =
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36';
    const req = new Request(`${SELF_ORIGIN}foo?bundle`, {
        headers: { 'user-agent': knownUserAgent },
    });
    await handler(req);
    assertEquals(
        (fetchMock.calls?.[0]?.args?.[1]?.headers as Headers).get('user-agent'),
        knownUserAgent,
    );
});

Deno.test('should handle $UPSTREAM_ORIGIN with ending slash', async () => {
    const UPSTREAM_ORIGIN = 'https://esm.sh/';
    const fetchMock = spy(() => fetchReturn());
    const handler = createMainHandler(
        {
            ...baseConfig,
            UPSTREAM_ORIGIN,
        },
        undefined,
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
    const handler = createMainHandler(
        {
            ...baseConfig,
            BASE_PATH,
        },
        undefined,
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
    const handler = createMainHandler(
        {
            ...baseConfig,
            BASE_PATH,
        },
        undefined,
        undefined,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}sub-dir/foo?bundle`, {
        headers: { 'X-Real-Origin': 'https://systemjs.comu.cat/' },
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
        const handler = createMainHandler(
            baseConfig,
            undefined,
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
    const handler = createMainHandler(
        baseConfig,
        undefined,
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
    const handler = createMainHandler(
        baseConfig,
        undefined,
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
    const workerPool = createWorkerPool(config);
    const handler = createMainHandler(
        config,
        undefined,
        workerPool,
        fetchMock,
    );
    const req = new Request(`${SELF_ORIGIN}vue`);
    const res: Response = await handler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), true);
    assertEquals(systemjsCode.endsWith(' - (worker) */\n'), true);
    await workerPool.drain();
    await workerPool.clear();
});

Deno.test('should replace the $UPSTREAM_ORIGIN by the self host', async () => {
    const fetchMock = spy(() => fetchReturn());
    const handler = createMainHandler(
        baseConfig,
        undefined,
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
    const handler = createMainHandler(
        baseConfig,
        undefined,
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
        const handler = createMainHandler(
            {
                ...baseConfig,
                BASE_PATH,
            },
            undefined,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}sub-dir/234/vue`);
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
        const handler = createMainHandler(
            {
                ...baseConfig,
                BASE_PATH,
            },
            undefined,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}sub-dir/234/vue`);
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
        const handler = createMainHandler(
            {
                ...baseConfig,
                BASE_PATH,
            },
            undefined,
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
        const req = new Request(`${SELF_ORIGIN}sub-dir/234/vue`, {
            headers: { 'X-Real-Origin': realOrigin },
        });
        const handler = createMainHandler(
            {
                ...baseConfig,
                BASE_PATH,
            },
            undefined,
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
        const handler = createMainHandler(
            baseConfig,
            undefined,
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
        const handler = createMainHandler(
            baseConfig,
            undefined,
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
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) =>
                new Response('/* cached */', {
                    status: 200,
                    statusText: 'OKIE',
                })
            ),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.match, 1);
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
            assertSpyCalls(cacheMock.put, 0);
        });
    },
);

Deno.test(
    'should fetch $UPSTREAM_ORIGIN if there is no cached response',
    async (t) => {
        const upstreamBody = 'export const foobar = 1;';
        const fetchMock = spy(() => fetchReturn(upstreamBody));
        const cacheMock = {
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) => undefined),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.match, 1);
        });
        await t.step('should fetch $UPSTREAM_ORIGIN', async () => {
            assertSpyCalls(fetchMock, 1);
        });
        await t.step('should set the response in the cache', async () => {
            assertSpyCalls(cacheMock.put, 1);
            const spyCall = cacheMock.put.calls[0];
            const firstArg = spyCall && spyCall.args[0];
            const secondArg = spyCall && spyCall.args[1]; // && spyCall.args[1].clone();
            assertEquals(firstArg.url, `${SELF_ORIGIN}foo?bundle`);
            assertEquals(
                (await secondArg.text()).includes('const foobar'),
                true,
            );
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should fast-path the contents of the redirect location if those exist in cache',
    async (t) => {
        const cacheReturns = [
            // url: `${SELF_ORIGIN}foo?bundle`,
            new Response('', {
                headers: {
                    location: `${SELF_ORIGIN}foo@2?bundle`,
                },
                status: 302,
                statusText: 'Redirect',
            }),
            // url: `${SELF_ORIGIN}foo@2?bundle`,
            new Response('/* cached */', {
                status: 200,
                statusText: 'OKIE',
            }),
        ];
        const fetchMock = spy(() => fetchReturn());
        const cacheMock = {
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) => {
                return cacheReturns.shift() || undefined;
            }),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
            REDIRECT_FASTPATH: true,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.match, 2);
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
            assertSpyCalls(cacheMock.put, 0);
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should make a fresh fetch from upstream if those do not exist in cache',
    async (t) => {
        const cacheReturns = [
            // url: `${SELF_ORIGIN}foo?bundle`,
            new Response('', {
                headers: {
                    location: `${SELF_ORIGIN}foo@2?bundle`,
                },
                status: 302,
                statusText: 'Redirect',
            }),
        ];
        const fetchMock = spy(() => fetchReturn('/* fresh */'));
        const cacheMock = {
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) => {
                return cacheReturns.shift() || undefined;
            }),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
            CACHE_CLIENT_REDIRECT: 60,
            REDIRECT_FASTPATH: true,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.match, 2);
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
            assertSpyCalls(cacheMock.put, 1);
        });
    },
);

Deno.test(
    'When the cached response is a redirect > should return the redirect as-is if Location response header is missing',
    async (t) => {
        const cacheReturns = [
            // url: `${SELF_ORIGIN}foo?bundle`,
            new Response('', {
                status: 302,
                statusText: 'Redirect',
            }),
        ];
        const fetchMock = spy(() => fetchReturn());
        const cacheMock = {
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) => {
                return cacheReturns.shift() || undefined;
            }),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
            CACHE_CLIENT_REDIRECT: 600,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step('should try to get from the cache', async () => {
            assertSpyCalls(cacheMock.match, 1);
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
            assertSpyCalls(cacheMock.put, 0);
        });
    },
);

Deno.test(
    'when $UPSTREAM_ORIGIN response is a redirect > should fast-path the contents of the redirect location if those exist in cache',
    async (t) => {
        const cacheReturns = [
            undefined,
            // url: `${SELF_ORIGIN}foo@2?bundle`,
            new Response('/* cached */', {
                status: 200,
                statusText: 'OKIE',
            }),
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
            delete: spy(async (_req: Request) => true),
            match: spy(async (_req: Request) => {
                return cacheReturns.shift() || undefined;
            }),
            put: spy(async (_req: Request, _res: Response) => undefined),
        };
        const config = {
            ...baseConfig,
            CACHE_ENABLE: true,
            CACHE_REDIRECT: 600,
            REDIRECT_FASTPATH: true,
        };
        const handler = createMainHandler(
            config,
            cacheMock,
            undefined,
            fetchMock,
        );
        const req = new Request(`${SELF_ORIGIN}foo?bundle`);
        const res = await handler(req);
        await t.step(
            'should try to get from the cache a total of two times',
            async () => {
                assertSpyCalls(cacheMock.match, 2);
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
            'should add an "x-location" header with the followed redirection',
            async () => {
                assertEquals(
                    res.headers.get('x-location'),
                    `${SELF_ORIGIN}foo@2?bundle`,
                );
            },
        );
        await t.step(
            'should fetch $UPSTREAM_ORIGIN the first time',
            async () => {
                assertSpyCalls(fetchMock, 1);
            },
        );
        await t.step('should set in the cache 1 time', async () => {
            assertSpyCalls(cacheMock.put, 1);
        });
    },
);
