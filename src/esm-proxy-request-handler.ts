import { toSystemjs } from './to-systemjs.ts';

export async function esmProxyRequestHandler(req: Request) {
  const modifiedUrl = new URL(req.url, 'https://esm.sh');
  const esmCode = await fetch(modifiedUrl.toString(), { headers: req.headers }).then((res) => res.text());
  const systemjsCode = await toSystemjs(esmCode);
  return new Response(systemjsCode);
}
