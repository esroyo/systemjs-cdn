import { ModuleFormat, rollup } from 'rollup';
import virtual from '@rollup/plugin-virtual';
//import { minify } from 'npm:rollup-plugin-esbuild';

export const toSystemjs = async (esmCode: string): Promise<string>  => {

  const inputOptions = {
    external: () => true,
    input: 'esmCode',
    plugins: [
      virtual({ esmCode }),
      //minify(),
    ],
    treeshake: false,
  };

  const outputOptions = {
    file: 'out.mjs',
    format: 'systemjs' as ModuleFormat,
    sourcemap: false,
  };

  const bundle = await rollup(inputOptions);
  const { output } = await bundle.generate(outputOptions);
  await bundle.close();
  return output[0].code.replace(/https:\/\/esm\.sh\//g, 'https://systemjs.sh/');
}
