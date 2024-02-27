import { Redis } from '../../deps.ts';
import { Cache, ResponseProps } from '../types.ts';
import { calcExpires } from '../utils.ts';

export class RedisCache implements Cache {
    protected glue = ';;';

    constructor(private redis: Promise<Redis>) {}

    protected serializeKey(key: string[]): string {
        return key.join(this.glue);
    }

    protected unserializeKey(serializedKey: string): string[] {
        return serializedKey.split(this.glue);
    }

    public async get(key: string[]): Promise<ResponseProps | null> {
        const settledRedis = await this.redis;
        const data = await settledRedis.get(this.serializeKey(key));
        const value = data && JSON.parse(data);
        const isValidCacheEntry = !!(
            value &&
            value.expires &&
            value.expires > Date.now()
        );
        return isValidCacheEntry ? value : null;
    }

    public async set(key: string[], value: ResponseProps): Promise<void> {
        const data = JSON.stringify({
            ...value,
            expires: calcExpires(value.headers),
            headers: Object.fromEntries(value.headers.entries()),
        });
        const settledRedis = await this.redis;
        await settledRedis.set(this.serializeKey(key), data);
    }

    public async close(): Promise<void> {
        const settledRedis = await this.redis;
        return settledRedis.close();
    }
}
