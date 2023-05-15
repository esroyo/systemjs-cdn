import { assertEquals } from 'testing/asserts';
import { assertSpyCallArg, returnsNext, stub } from 'testing/mock';
import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';

Deno.test('esmProxyRequestHandler', async (t) => {

  const ESM_SERVICE_HOST = 'esm.sh';
  const SELF_HOST = 'systemjs.sh';
  const fetchReturn = Promise.resolve({ text: () => Promise.resolve(`export * from "https://${ESM_SERVICE_HOST}/stable/vue@3.3.2/es2022/vue.mjs";`) } as unknown as Response);
  const fetchStub = stub(globalThis, 'fetch', returnsNext([fetchReturn, fetchReturn, fetchReturn]));

  await t.step('should redirect to ESM_SERVICE_HOST on request empty', async () => {
    const req = new Request(`https://${SELF_HOST}/`);
    const res = await esmProxyRequestHandler(req);
    assertEquals(res.status, 308);
    assertEquals(res.headers.get('location'), `https://${ESM_SERVICE_HOST}/`);
  });

  await t.step('should forward the request to ESM_SERVICE_HOST keeping the parameters', async () => {
    const req = new Request(`https://${SELF_HOST}/foo?bundle`);
    await esmProxyRequestHandler(req);
    assertSpyCallArg(fetchStub, 0, 0, `https://${ESM_SERVICE_HOST}/foo?bundle`);
  });

  await t.step('should return an string of code in systemjs format', async () => {
    const req = new Request(`https://${SELF_HOST}/vue`);
    const res = await esmProxyRequestHandler(req);
    const systemjsCode = await res.text();
    assertEquals(systemjsCode.startsWith('System.register('), true);
  });

  await t.step('should replace the ESM_SERVICE_HOST by the self host', async () => {
    const req = new Request(`https://${SELF_HOST}/vue`);
    const res = await esmProxyRequestHandler(req);
    const systemjsCode = await res.text();
    assertEquals(!!systemjsCode.match(new RegExp(`https://${SELF_HOST}/stable/vue@3.3.2/es2022/vue.mjs`)), true);
  });

  fetchStub.restore();
});
