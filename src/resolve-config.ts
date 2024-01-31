import { dotenvLoad } from '../deps.ts';

type Config =
    & Record<
        | 'BASE_PATH'
        | 'CACHE_MAXAGE'
        | 'ESM_ORIGIN'
        | 'HOMEPAGE'
        | 'OUTPUT_BANNER',
        string
    >;
const DEFAULTS: Config = {
    ESM_ORIGIN: 'https://esm.sh',
    BASE_PATH: '',
    CACHE_MAXAGE: '600',
    HOMEPAGE: '',
    OUTPUT_BANNER: '',
} as const;
const __dirname = new URL('.', import.meta.url).pathname;

export const loadEnv = async (): Promise<void> => {
    await dotenvLoad({
        allowEmptyValues: true,
        envPath: `${__dirname}../.env`,
        examplePath: '',
        export: true,
    });
};

export const getEnvVar = async <T extends keyof typeof DEFAULTS>(
    key: T,
): Promise<Config[T]> => {
    const EXISTING_VALUE = Deno.env.get(key);
    if (typeof EXISTING_VALUE !== 'undefined') {
        return EXISTING_VALUE as Config[T];
    }
    await loadEnv();
    const ONFILE_VALUE = Deno.env.get(key);
    if (typeof ONFILE_VALUE !== 'undefined') {
        return ONFILE_VALUE as Config[T];
    }
    return DEFAULTS[key];
};

export const resolveConfig = async (): Promise<Config> => {
    const KEYS = Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>;
    const values = await Promise.all(KEYS.map((key) => getEnvVar(key)));
    const config = Object.fromEntries(
        values.map((value, idx) => [KEYS[idx], value]),
    ) as Config;
    return config;
};
