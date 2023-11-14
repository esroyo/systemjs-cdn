import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup,
    rollupPluginVirtual,
} from '../deps.ts';

export const toSystemjs = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    const inputOptions: InputOptions = {
        external: () => true,
        input: 'esmCode',
        plugins: [
            // @ts-ignore
            rollupPluginVirtual({ esmCode }),
        ],
        treeshake: false,
    };

    const outputOptions: OutputOptions = {
        dir: 'out', // not really used
        format: 'systemjs' as ModuleFormat,
        sourcemap: false,
    };

    const bundle = await rollup(inputOptions);
    const { output } = await bundle.generate({
        ...outputOptions,
        ...rollupOutputOptions,
    });
    await bundle.close();
    return output[0].code;
};
