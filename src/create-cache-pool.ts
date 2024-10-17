import genericPool, { type Options } from 'generic-pool';
import * as redis from 'redis';
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
            if (config.CACHE_REDIS_HOSTNAME) {
                const options: redis.RedisConnectOptions = {
                    hostname: config.CACHE_REDIS_HOSTNAME,
                    tls: config.CACHE_REDIS_TLS,
                    port: config.CACHE_REDIS_PORT,
                };
                if (config.CACHE_REDIS_PASSWORD) {
                    options.password = config.CACHE_REDIS_PASSWORD;
                }
                if (config.CACHE_REDIS_USERNAME) {
                    options.username = config.CACHE_REDIS_USERNAME;
                }
                return new RedisCache(redis.createLazyClient(options));
            }
            return new DenoKvCache();
        },
        async destroy(cache: Cache): Promise<void> {
            await cache.close();
        },
    };

    return genericPool.createPool(poolFactory, options);
}
