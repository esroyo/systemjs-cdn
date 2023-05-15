import { toSystemjs } from './to-systemjs.ts';

export async function esmProxyRequestHandler(req: Request) {
  let modifiedUrl: URL;
  let esmCode: string;
  try {
    modifiedUrl = new URL(req.url, 'https://esm.sh');
    esmCode = await fetch(modifiedUrl.toString(), { headers: req.headers }).then((res) => res.text());
    const systemjsCode = await toSystemjs(esmCode);
    return new Response(systemjsCode);
  } catch (error) {
    console.log(modifiedUrl?.toString());
    console.log(esmCode);
  }
}
