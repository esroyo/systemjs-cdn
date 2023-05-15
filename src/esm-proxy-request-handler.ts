import { toSystemjs } from './to-systemjs.ts';

const ESM_SERVICE_HOST = 'esm.sh';

export async function esmProxyRequestHandler(req: Request): Promise<Response | never> {
  const modifiedUrl = new URL(req.url);
  const selfHost = modifiedUrl.host;
  modifiedUrl.host = ESM_SERVICE_HOST;
  const esmCode = await fetch(modifiedUrl.toString(), { headers: req.headers }).then((res) => res.text());
  const systemjsCode = await toSystemjs(esmCode);
  return new Response(
    systemjsCode.replace(new RegExp(`//${ESM_SERVICE_HOST}/`, 'ig'), `//${selfHost}/`)
  );
}
