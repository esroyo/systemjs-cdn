import type { Config } from './types.ts';
import { dotenvLoad, redis, serve } from '../deps.ts';
import { DenoKvCache } from './cache/deno-kv-cache.ts';
import { RedisCache } from './cache/redis-cache.ts';
import { createRequestHandler } from './create-request-handler.ts';
import { sanitizeBasePath, sanitizeUpstreamOrigin } from './utils.ts';

dotenvLoad({ export: true });

const config: Config = {
    BASE_PATH: sanitizeBasePath(Deno.env.get('BASE_PATH')),
    CACHE: Deno.env.get('CACHE') === 'true',
    CACHE_REDIRECT: Number(Deno.env.get('CACHE_REDIRECT') as string) || 0,
    CACHE_CLIENT_REDIRECT:
        Number(Deno.env.get('CACHE_CLIENT_REDIRECT') as string) || 0,
    CACHE_REDIS_HOSTNAME: Deno.env.get('CACHE_REDIS_HOSTNAME') ?? '',
    HOMEPAGE: Deno.env.get('HOMEPAGE') ?? '',
    OUTPUT_BANNER: Deno.env.get('OUTPUT_BANNER') ?? '',
    REDIRECT_FASTPATH: Deno.env.get('REDIRECT_FASTPATH') === 'true',
    UPSTREAM_ORIGIN: sanitizeUpstreamOrigin(Deno.env.get('UPSTREAM_ORIGIN')),
    WORKER_ENABLE: Deno.env.get('WORKER_ENABLE') === 'true',
};

const cache = config.CACHE_REDIS_HOSTNAME
    ? new RedisCache(
        redis.createLazyClient({ hostname: config.CACHE_REDIS_HOSTNAME }),
    )
    : new DenoKvCache();

const requestHandler = createRequestHandler(config, cache);

serve(requestHandler, { port: 8000 });
