import { genericPool, type Options, redis } from '../deps.ts';
import { Cache, Config } from './types.ts';
import { DenoKvCache } from './cache/deno-kv-cache.ts';
import { RedisCache } from './cache/redis-cache.ts';

export function createCachePool(
    config: Config,
    options: Options = {},
    factory?: () => Cache,
) {
    if (!options.max) {
        options.max = config.CACHE_CONN_MAX;
    }
    if (!options.min) {
        options.min = config.CACHE_CONN_MIN;
    }
    const poolFactory = {
        async create(): Promise<Cache> {
            if (factory) {
                return factory();
            }
            // Step: cache service
            const cache = config.CACHE_REDIS_HOSTNAME
                ? new RedisCache(
                    redis.createLazyClient({
                        hostname: config.CACHE_REDIS_HOSTNAME,
                    }),
                )
                : new DenoKvCache();
            return cache;
        },
        async destroy(cache: Cache): Promise<void> {
            await cache.close();
        },
    };

    return genericPool.createPool(poolFactory, options);
}
