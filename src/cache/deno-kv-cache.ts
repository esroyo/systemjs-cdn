import { kvGet, kvSet } from '../../deps.ts';
import { Cache, CacheSetOptions, ResponseProps } from '../types.ts';

export class DenoKvCache implements Cache {
    constructor(private kv: Promise<Deno.Kv> = Deno.openKv()) {}

    public async get(key: string[]): Promise<ResponseProps | null> {
        const settledKv = await this.kv;
        const blob = await kvGet(settledKv, ['cache', ...key]);
        const value = blob && JSON.parse(new TextDecoder().decode(blob));
        return value || null;
    }

    public async set(
        key: string[],
        value: ResponseProps,
        options?: CacheSetOptions,
    ): Promise<void> {
        const blob = new TextEncoder().encode(JSON.stringify({
            ...value,
            headers: Object.fromEntries(value.headers.entries()),
        }));
        const settledKv = await this.kv;
        await kvSet(settledKv, ['cache', ...key], blob, options);
    }

    public async close(): Promise<void> {
        const settledKv = await this.kv;
        return settledKv.close();
    }
}
