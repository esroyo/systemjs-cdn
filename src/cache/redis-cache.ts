import { type Redis } from 'redis';
import { Cache, CacheSetOptions, ResponseProps } from '../types.ts';

export class RedisCache implements Cache {
    protected glue = ';;';

    constructor(private redis: Promise<Redis> | Redis) {}

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
        return value || null;
    }

    public async set(
        key: string[],
        value: ResponseProps,
        options?: CacheSetOptions,
    ): Promise<void> {
        const data = JSON.stringify({
            ...value,
            headers: Object.fromEntries(value.headers.entries()),
        });
        const optionsRedis: { ex?: number } = {};
        if (options?.expireIn) {
            optionsRedis.ex = Math.floor(options.expireIn / 1000);
        }
        const settledRedis = await this.redis;
        await settledRedis.set(this.serializeKey(key), data, optionsRedis);
    }

    public async close(): Promise<void> {
        const settledRedis = await this.redis;
        return settledRedis.close();
    }
}
