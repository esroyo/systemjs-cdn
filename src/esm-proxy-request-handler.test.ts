import { assertEquals } from 'testing/asserts';
import { assertSpyCallArg, returnsNext, stub } from 'testing/mock';
import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';

Deno.test('should return an string of code in systemjs format', async () => {
  const fetchStub = stub(globalThis, 'fetch', returnsNext([
      Promise.resolve({ text: () => Promise.resolve('export * from "https://esm.sh/stable/vue@3.3.2/es2022/vue.mjs";') } as unknown as Response),
  ]));
  const req = new Request('https://systemjs.sh/vue');
  const res = await esmProxyRequestHandler(req);
  const systemjsCode = await res.text();
  assertEquals(systemjsCode.startsWith('System.register('), true);
  fetchStub.restore();
});

Deno.test('should forward the request to host "esm.sh" keeping the parameters', async () => {
  const fetchStub = stub(globalThis, 'fetch', returnsNext([
      Promise.resolve({ text: () => Promise.resolve('export default "foo"') } as unknown as Response),
  ]));
  const req = new Request('https://systemjs.sh/foo?bundle');
  const res = await esmProxyRequestHandler(req);
  const systemjsCode = await res.text();
  assertSpyCallArg(fetchStub, 0, 0, 'https://esm.sh/foo?bundle');
  fetchStub.restore();
});
