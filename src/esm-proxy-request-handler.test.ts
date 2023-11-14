import {
    assertEquals,
    assertSpyCallArg,
    returnsNext,
    stub,
} from '../dev_deps.ts';

import { _internals } from './utils.ts';
import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';
import { resolveConfig } from './resolve-config.ts';

const { ESM_ORIGIN } = await resolveConfig();
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
        'should use curl to get the "Location:" header if ESM_SEVICE_HOST response is not ok and redirect',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([
                    Promise.resolve(new Response('', { status: 302 })),
                ]),
            );
            const curlStub = stub(
                _internals,
                'curl',
                returnsNext([
                    Promise.resolve({
                        statusCode: 302,
                        headers: [{
                            name: 'location',
                            value: `${ESM_ORIGIN}/stable/vue@3.3.2`,
                        }],
                    }),
                ]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await esmProxyRequestHandler(req);
            assertEquals(res.status, 302);
            assertEquals(
                res.headers.get('location'),
                `${SELF_ORIGIN}/stable/vue@3.3.2`,
            );
            fetchStub.restore();
            curlStub.restore();
        },
    );

    await t.step(
        'should use curl to get the "Location:" header if ESM_SEVICE_HOST response is not ok and pass-through if not redirecting',
        async () => {
            const fetchStub = stub(
                _internals,
                'fetch',
                returnsNext([
                    Promise.resolve(new Response('', { status: 404 })),
                ]),
            );
            const curlStub = stub(
                _internals,
                'curl',
                returnsNext([
                    Promise.resolve({ statusCode: 500 }),
                ]),
            );
            const req = new Request(`${SELF_ORIGIN}/vue`);
            const res = await esmProxyRequestHandler(req);
            assertEquals(res.status, 404);
            fetchStub.restore();
            curlStub.restore();
        },
    );
});
