import {
    assertEquals,
    assertSpyCallArg,
    assertSpyCalls,
    returnsNext,
    stub,
} from '../dev_deps.ts';

import { _internals } from './utils.ts';
import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';
import { resolveConfig } from './resolve-config.ts';

const {
    ESM_ORIGIN,
} = await resolveConfig();
const SELF_ORIGIN = 'https://systemjs.test';

const fetchReturn = (
    body = `export * from "${ESM_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs";`,
) => (
    Promise.resolve(
        new Response(body, {
            headers: new Headers({ 'access-control-allow-origin': '*' }),
        }),
    )
);

Deno.test('esmProxyRequestHandler', async (t) => {
    await t.step('should redirect to $esmOrigin on request empty', async () => {
        const req = new Request(SELF_ORIGIN);
        const res = await esmProxyRequestHandler(req);
        assertEquals(res.status, 302);
        assertEquals(res.headers.get('location'), `${ESM_ORIGIN}/`);
    });

    await t.step(
        'should forward the request to $esmOrigin keeping the parameters',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
            await esmProxyRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${ESM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
        },
    );

    await t.step('should handle $esmOrigin with ending slash', async () => {
        Deno.env.set('ESM_ORIGIN', 'https://esm.sh/');
        const fetchStub = stub(
            _internals,
            'fetch',
            returnsNext([fetchReturn()]),
        );
        const req = new Request(`${SELF_ORIGIN}/foo?bundle`);
        await esmProxyRequestHandler(req);
        assertSpyCallArg(fetchStub, 0, 0, `https://esm.sh/foo?bundle`);
        fetchStub.restore();
        Deno.env.set('ESM_ORIGIN', ESM_ORIGIN);
    });

    await t.step(
        'should forward the request to $esmOrigin removing the $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/sub-dir/foo?bundle`);
            await esmProxyRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${ESM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should forward the request to $esmOrigin taking into account that `X-Real-Origin` and the current request URL may differ in origin',
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
            await esmProxyRequestHandler(req);
            assertSpyCallArg(fetchStub, 0, 0, `${ESM_ORIGIN}/foo?bundle`);
            fetchStub.restore();
            Deno.env.set('BASE_PATH', '');
        },
    );

    await t.step(
        'should forward the ESM_SEVICE_HOST response headers back to the client',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await esmProxyRequestHandler(req);
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
            const res: Response = await esmProxyRequestHandler(req);
            const systemjsCode = await res.text();
            assertEquals(systemjsCode.startsWith('System.register('), true);
            fetchStub.restore();
        },
    );

    await t.step('should replace the $esmOrigin by the self host', async () => {
        const fetchStub = stub(
            _internals,
            'fetch',
            returnsNext([fetchReturn()]),
        );
        const req = new Request(`${SELF_ORIGIN}/vue`);
        const res = await esmProxyRequestHandler(req);
        const systemjsCode = await res.text();
        assertEquals(
            !!systemjsCode.match(
                new RegExp(`${SELF_ORIGIN}/stable/vue@3.3.2/es2022/vue.mjs`),
            ),
            true,
        );
        fetchStub.restore();
    });

    await t.step(
        'should replace the $esmOrigin by the X-Real-Origin host if exists',
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
            const res = await esmProxyRequestHandler(req);
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
        'should replace the $esmOrigin by the self host including $basePath',
        async () => {
            Deno.env.set('BASE_PATH', '/sub-dir/234');
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([fetchReturn()]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await esmProxyRequestHandler(req);
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
        'should replace the $esmOrigin by the X-Real-Origin host if exists including $basePath',
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
            const res = await esmProxyRequestHandler(req);
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
                    Promise.resolve(new Response('', {
                        status: 302,
                        headers: {
                            'Location': `${ESM_ORIGIN}/stable/vue@3.3.2`,
                        },
                    })),
                ]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await esmProxyRequestHandler(req);
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
            const res = await esmProxyRequestHandler(req);
            assertEquals(res.status, 404);
            assertSpyCalls(fetchStub, 1);
            fetchStub.restore();
        },
    );
});
