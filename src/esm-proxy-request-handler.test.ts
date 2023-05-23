import { assertEquals } from 'testing/asserts';
import { assertSpyCallArg, returnsNext, stub } from 'testing/mock';

import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';
import { resolveConfig } from './resolve-config.ts';

const { esmOrigin } = await resolveConfig();
const selfOrigin = 'https://systemjs.test';

Deno.test('esmProxyRequestHandler', async (t) => {

  const fetchReturn = (body = `export * from "${esmOrigin}/stable/vue@3.3.2/es2022/vue.mjs";`) => (
    Promise.resolve(new Response(body, { headers: new Headers({ 'access-control-allow-origin': '*' }) }))
  );
  const fetchStub = stub(globalThis, 'fetch', returnsNext([
      //
      fetchReturn(),
      fetchReturn(),
      fetchReturn(),
      fetchReturn(),
  ]));

  await t.step('should redirect to $esmOrigin on request empty', async () => {
    const req = new Request(selfOrigin);
    const res = await esmProxyRequestHandler(req);
    assertEquals(res.status, 308);
    assertEquals(res.headers.get('location'), `${esmOrigin}/`);
  });

  await t.step('should forward the request to $esmOrigin keeping the parameters', async () => {
    const req = new Request(`${selfOrigin}/foo?bundle`);
    await esmProxyRequestHandler(req);
    assertSpyCallArg(fetchStub, 0, 0, `${esmOrigin}/foo?bundle`);
  });

  await t.step('should forward the ESM_SEVICE_HOST response headers back to the client', async () => {
    const req = new Request(`${selfOrigin}/vue`);
    const res = await esmProxyRequestHandler(req);
    assertEquals(res.headers.get('access-control-allow-origin'), '*');
  });

  await t.step('should return an string of code in systemjs format', async () => {
    const req = new Request(`${selfOrigin}/vue`);
    const res: Response = await esmProxyRequestHandler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), true);
  });

  await t.step('should replace the $esmOrigin by the self host', async () => {
    const req = new Request(`${selfOrigin}/vue`);
    const res = await esmProxyRequestHandler(req);
    const systemjsCode = await res.text();
    assertEquals(!!systemjsCode.match(new RegExp(`${selfOrigin}/stable/vue@3.3.2/es2022/vue.mjs`)), true);
  });

  fetchStub.restore();
});
