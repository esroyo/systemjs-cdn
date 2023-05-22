import { getEsmOrigin } from './get-esm-origin.ts';
import { toSystemjs } from './to-systemjs.ts';

const ESM_ORIGIN = getEsmOrigin();
const ESM_HOST = new URL(ESM_ORIGIN).host;

export async function esmProxyRequestHandler(req: Request): Promise<Response | never> {
  const url = new URL(req.url);
  if (url.pathname === '/') {
    return Response.redirect(ESM_ORIGIN, 308);
  }
  const selfHost = url.host;
  const modifiedUrl = new URL(url);
  modifiedUrl.host = ESM_HOST;
  const esmResponse = await fetch(modifiedUrl.toString(), { headers: req.headers });
  const esmCode = await esmResponse.text();
  const systemjsCode = await toSystemjs(esmCode);
  return new Response(
    systemjsCode.replace(new RegExp(`${ESM_ORIGIN}/`, 'ig'), `https://${selfHost}/`),
    { headers: esmResponse.headers },
  );
}
