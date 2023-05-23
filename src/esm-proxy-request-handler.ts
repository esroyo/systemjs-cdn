import { resolveConfig } from './resolve-config.ts';
import { toSystemjs } from './to-systemjs.ts';


export async function esmProxyRequestHandler(req: Request): Promise<Response | never> {
  const { esmOrigin } = await resolveConfig();
  const selfUrl = new URL(req.url);
  if (selfUrl.pathname === '/') {
    return Response.redirect(esmOrigin, 308);
  }
  const esmUrl = new URL(req.url.replace(selfUrl.origin, ''), esmOrigin);
  const esmResponse = await fetch(esmUrl.toString(), { headers: req.headers });
  const esmCode = await esmResponse.text();
  const systemjsCode = await toSystemjs(esmCode);
  return new Response(
    systemjsCode.replace(new RegExp(esmOrigin, 'ig'), selfUrl.origin),
    { headers: esmResponse.headers },
  );
}
