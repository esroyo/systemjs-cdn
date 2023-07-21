import { HttpZResponseModel, httpz, request } from '../deps.ts';

type PartialHttpResponse = Pick<HttpZResponseModel, 'statusCode' | 'statusMessage' | 'headers'>;

export const curl = async (args: string[]): Promise<PartialHttpResponse> => {
  const { stdout } = await new Deno.Command('curl', { args }).output();
  return httpz.parse(new TextDecoder().decode(stdout)) as HttpZResponseModel;
};

export const head = async (url: string, headers: Headers): Promise<PartialHttpResponse> => {

    const { statusCode, statusMessage, headers: resHeaders } = await new Promise<Record<string, unknown>>((resolve, reject) => {
            request({
                method: 'HEAD',
                url,
                followRedirect: false,
                headers,
            }, function (error, response, _body) {
                if (error) {
                    return reject(error);
                }
                resolve({
                    headers: response?.headers,
                    statusCode: response?.statusCode,
                });
            });
        });

    return {
        statusCode: statusCode as number,
        statusMessage: statusMessage as string,
        headers: Object.entries(resHeaders as Record<string, string>).map(([name, value]) => ({ name, value })),
    };
};

export const fetch = globalThis.fetch;

export const _internals = {
  curl,
  fetch,
  head,
};
