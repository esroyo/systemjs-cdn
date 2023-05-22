import 'dotenv';

export const getEsmOrigin = () => {
  return Deno.env.get('ESM_ORIGIN') || 'https://esm.sh';
};
