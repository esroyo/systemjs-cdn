const DEFAULT_ESM_ORIGIN = 'https://esm.sh';
const __dirname = new URL('.', import.meta.url).pathname;

export const loadEnv = async (): Promise<void> => {
  const { load } = await import('dotenv');
  await load({
    envPath: `${__dirname}../.env`,
    export: true,
  });
};

export const getEsmOrigin = async () => {
  const EXISTING_ESM_ORIGIN = Deno.env.get('ESM_ORIGIN');
  if (EXISTING_ESM_ORIGIN) {
    return EXISTING_ESM_ORIGIN;
  }
  await loadEnv();
  const ONFILE_ESM_ORIGIN = Deno.env.get('ESM_ORIGIN');
  if (ONFILE_ESM_ORIGIN) {
    return ONFILE_ESM_ORIGIN;
  }
  return DEFAULT_ESM_ORIGIN;
};

export const resolveConfig = async () => ({
  esmOrigin: await getEsmOrigin(),
});
