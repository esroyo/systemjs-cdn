import { get as kvGet, set as kvSet } from '@kitsonk/kv-toolbox/blob';
import { Cache, CacheSetOptions, ResponseProps } from '../types.ts';

export class DenoKvCache implements Cache {
    constructor(
        protected _kv: Promise<Deno.Kv> = Deno.openKv(),
        protected _decoder = new TextDecoder(),
        protected _encoder = new TextEncoder(),
    ) {}

    public async get(key: string[]): Promise<ResponseProps | null> {
        const settledKv = await this._kv;
        const blob = await kvGet(settledKv, ['cache', ...key], {
            consistency: 'eventual',
        });
        const value = blob?.value &&
            JSON.parse(this._decoder.decode(blob.value));
        return value || null;
    }

    public async set(
        key: string[],
        value: ResponseProps,
        options?: CacheSetOptions,
    ): Promise<void> {
        const blob = this._encoder.encode(JSON.stringify({
            ...value,
            headers: Object.fromEntries(value.headers.entries()),
        }));
        const settledKv = await this._kv;
        await kvSet(settledKv, ['cache', ...key], blob, options);
    }

    public async close(): Promise<void> {
        const settledKv = await this._kv;
        return settledKv.close();
    }
}
