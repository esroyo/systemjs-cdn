import virtual from '@rollup/plugin-virtual';
import { InputOptions, ModuleFormat, OutputOptions, rollup } from 'rollup';

export const toSystemjs = async (esmCode: string): Promise<string>  => {

  const inputOptions: InputOptions = {
    external: () => true,
    input: 'esmCode',
    plugins: [
      // @ts-ignore
      virtual({ esmCode }),
    ],
    treeshake: false,
  };

  const outputOptions: OutputOptions = {
    dir: 'out', // not really used
    format: 'systemjs' as ModuleFormat,
    sourcemap: false,
  };

  const bundle = await rollup(inputOptions);
  const { output } = await bundle.generate(outputOptions);
  await bundle.close();
  return output[0].code;
}
