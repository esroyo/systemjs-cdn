import { HttpZResponseModel, httpz } from '../deps.ts';

type PartialHttpResponse = Pick<HttpZResponseModel, 'statusCode' | 'headers'>;

export const curl = async (args: string[]): Promise<PartialHttpResponse> => {
  const { stdout } = await new Deno.Command('curl', { args }).output();
  return httpz.parse(new TextDecoder().decode(stdout)) as HttpZResponseModel;
};

export const fetch = globalThis.fetch;

export const _internals = {
  curl,
  fetch,
};
