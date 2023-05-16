import { toSystemjs } from './to-systemjs.ts';

const ESM_SERVICE_HOST = 'esm.sh';

export async function esmProxyRequestHandler(req: Request): Promise<Response | never> {
  const modifiedUrl = new URL(req.url);
  if (modifiedUrl.pathname === '/') {
    return Response.redirect(`https://${ESM_SERVICE_HOST}`, 308);
  }
  const selfHost = modifiedUrl.host;
  modifiedUrl.host = ESM_SERVICE_HOST;
  const esmResponse = await fetch(modifiedUrl.toString(), { headers: req.headers });
  const esmCode = await esmResponse.text();
  const systemjsCode = await toSystemjs(esmCode);
  return new Response(
    systemjsCode.replace(new RegExp(`//${ESM_SERVICE_HOST}/`, 'ig'), `//${selfHost}/`),
    { headers: esmResponse.headers },
  );
}
