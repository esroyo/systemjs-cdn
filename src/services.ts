import { Cache } from './types.ts';
import { DenoKvCache } from './cache/deno-kv-cache.ts';
import { RedisCache } from './cache/redis-cache.ts';
import { redis } from '../deps.ts';

type Instances = {
    cache?: Cache;
};

const instances: Instances = {};

export const services = {
    get cache(): Cache {
        if (!instances.cache) {
            const REDIS_HOSTNAME = Deno.env.get('CACHE_REDIS_HOSTNAME');
            if (REDIS_HOSTNAME) {
                const redisPromise = redis.connect({
                    hostname: REDIS_HOSTNAME,
                });
                instances.cache = new RedisCache(redisPromise);
                redisPromise.catch(() => {
                    instances.cache?.close();
                    delete instances.cache;
                });
            } else {
                const denoKv: Promise<Deno.Kv> = Deno.openKv();
                instances.cache = new DenoKvCache(denoKv);
            }
        }
        return instances.cache;
    },
};
