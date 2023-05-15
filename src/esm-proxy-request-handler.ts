import { toSystemjs } from './to-systemjs.ts';

export async function esmProxyRequestHandler(req: Request): Promise<Response | never> {
  let modifiedUrl: URL;
  let esmCode: string;
  try {
    modifiedUrl = new URL(req.url);
    modifiedUrl.hostname = 'esm.sh';
    esmCode = await fetch(modifiedUrl.toString(), { headers: req.headers }).then((res) => res.text());
    const systemjsCode = await toSystemjs(esmCode);
    return new Response(systemjsCode);
  } catch (error) {
    // @ts-ignore
    console.log(modifiedUrl?.toString());
    // @ts-ignore
    console.log(esmCode);
    throw error;
  }
}
