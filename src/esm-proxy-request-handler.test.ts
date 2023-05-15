import { assertEquals } from 'testing/asserts';
import { returnsNext, stub } from 'testing/mock';
import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';

Deno.test('should return an string of code in systemjs format', async () => {
  const fetchStub = stub(globalThis, 'fetch', returnsNext([
      Promise.resolve({ text: () => Promise.resolve('export * from "https://esm.sh/stable/vue@3.3.2/es2022/vue.mjs";') } as unknown as Response),
  ]));
  const req = new Request('https://esm.sh/vue');
  const res = await esmProxyRequestHandler(req);
  const systemjsCode = await res.text();
  assertEquals(systemjsCode.startsWith('System.register('), true);
  fetchStub.restore();
});
