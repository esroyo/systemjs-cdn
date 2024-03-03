import { kvGet, kvSet } from '../../deps.ts';
import { Cache, ResponseProps } from '../types.ts';
import { calcExpires } from '../utils.ts';

export class DenoKvCache implements Cache {
    constructor(private kv: Promise<Deno.Kv> = Deno.openKv()) {}

    public async get(key: string[]): Promise<ResponseProps | null> {
        const settledKv = await this.kv;
        const blob = await kvGet(settledKv, ['cache', ...key]);
        const value = blob && JSON.parse(new TextDecoder().decode(blob));
        return value || null;
    }

    public async set(key: string[], value: ResponseProps): Promise<void> {
        const expires = calcExpires(value.headers);
        const blob = new TextEncoder().encode(JSON.stringify({
            ...value,
            headers: Object.fromEntries(value.headers.entries()),
        }));
        const settledKv = await this.kv;
        await kvSet(settledKv, ['cache', ...key], blob, { expireIn: expires });
    }

    public async close(): Promise<void> {
        const settledKv = await this.kv;
        return settledKv.close();
    }
}
