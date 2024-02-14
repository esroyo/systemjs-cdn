import {
    assertEquals,
    assertSpyCallArg,
    assertSpyCalls,
    returnsNext,
    stub,
} from '../dev_deps.ts';
import { dotenvLoad } from '../deps.ts';

import { _internals } from './utils.ts';
import { sjsRequestHandler } from './sjs-request-handler.ts';

dotenvLoad({ export: true });

const UPSTREAM_ORIGIN = Deno.env.get('UPSTREAM_ORIGIN') as string;
const HOMEPAGE = Deno.env.get('HOMEPAGE');
const SELF_ORIGIN = 'https://systemjs.test';

// Disable cache for tests
Deno.env.set('CACHE', 'false');
Deno.env.set('OUTPUT_BANNER', '');

const fetchReturn = (
    body =
        `export * from "${UPSTREAM_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs";`,
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

Deno.test('sjsRequestHandler', async (t) => {
    await t.step('should redirect to $HOMEPAGE on request empty', async () => {
        const req = new Request(SELF_ORIGIN);
        const res = await sjsRequestHandler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), HOMEPAGE);
    });

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN keeping the parameters',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
            await sjsRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${UPSTREAM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
        },
    );

    await t.step(
        'should handle $UPSTREAM_ORIGIN with ending slash',
        async () => {
            Deno.env.set('UPSTREAM_ORIGIN', 'https://esm.sh/');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
            await sjsRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `https://esm.sh/foo?bundle`);
            fetchStub.restore();
            Deno.env.set('UPSTREAM_ORIGIN', UPSTREAM_ORIGIN);
        },
    );

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN removing the $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/sub-dir/foo?bundle`);
            await sjsRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${UPSTREAM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should forward the request to $UPSTREAM_ORIGIN taking into account that `X-Real-Origin` and the current request URL may differ in origin',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/sub-dir/foo?bundle`, {
                headers: { 'X-Real-Origin': 'https://systemjs.sh/' },
            });
            await sjsRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${UPSTREAM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should forward the upstream response CORS headers back to the client',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
            assertEquals(res.headers.get('access-control-allow-origin'), '*');
            fetchStub.restore();
        },
    );

    await t.step(
        'should return an string of code in systemjs format',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res: Response = await sjsRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(systemjsCode.startsWith('System.register('), true);
            fetchStub.restore();
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the self host',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${SELF_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
            fetchStub.restore();
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const realOrigin = 'https://public.proxy.com';
            const req = new Request(`${SELF_ORIGIN}/vue`, {
                headers: { 'X-Real-Origin': realOrigin },
            });
            const res = await sjsRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(`${realOrigin}/stable/vue@3.3.2/es2022/vue.mjs`),
                ),
                true,
            );
            fetchStub.restore();
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the self host including $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir/234');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${SELF_ORIGIN}/sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should prefix the absolute paths (missing $UPSTREAM_ORIGIN) with the $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir/234');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn(`
import "/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs";
export const foo = () => import("/stable/monaco-editor@0.45.0/es2022/monaco-editor.css");
export const bar = () => import("https://unpkg.com/systemjs/dist/s.js");
export * from "/stable/vue@3.3.4/es2022/vue.mjs";
                    `)]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
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
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should do nothing to the absolute paths (missing $UPSTREAM_ORIGIN) when the $basePath is empty',
        async () => {
            Deno.env.set('BASE_PATH', '');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn(`
import "/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs";
export * from "/stable/vue@3.3.4/es2022/vue.mjs";
                    `)]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
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
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should replace the $UPSTREAM_ORIGIN by the X-Real-Origin host if exists including $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir/234');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const realOrigin = 'https://public.proxy.com';
            const req = new Request(`${SELF_ORIGIN}/vue`, {
                headers: { 'X-Real-Origin': realOrigin },
            });
            const res = await sjsRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(
                !!systemjsCode.match(
                    new RegExp(
                        `${realOrigin}/sub-dir/234/stable/vue@3.3.2/es2022/vue.mjs`,
                    ),
                ),
                true,
            );
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should return a redirect reponse with the replaced "Location:" header when ESM_SERVICE_HOST responds with >= 300 < 400 status',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([
                    Promise.resolve(
                        new Response('', {
                            status: 302,
                            headers: {
                                'Location':
                                    `${UPSTREAM_ORIGIN}/stable/vue@3.3.2`,
                            },
                        }),
                    ),
                ]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
            assertEquals(res.status, 302);
            assertEquals(
                res.headers.get('location'),
                `${SELF_ORIGIN}/stable/vue@3.3.2`,
            );
            assertSpyCalls(fetchStub, 1);
            fetchStub.restore();
        },
    );

    await t.step(
        'should return the original reponse "as-is" when ESM_SERVICE_HOST responds with a !ok status other than >= 300 < 400',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([
                    Promise.resolve(new Response('', { status: 404 })),
                ]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await sjsRequestHandler(req);
            assertEquals(res.status, 404);
            assertSpyCalls(fetchStub, 1);
            fetchStub.restore();
        },
    );
});
