import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup,
    rollupPluginVirtual,
} from '../deps.ts';

export const toSystemjsMain = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    const inputOptions: InputOptions = {
        external: () => true,
        input: 'esmCode',
        plugins: [
            // @ts-ignore untyped
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

export const toSystemjsWorker = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    const worker = new Worker(import.meta.resolve('./to-systemjs-worker.ts'), { type: 'module' });
    return new Promise((resolve) => {
        worker.addEventListener('message', (event: MessageEvent<{ code: string }>) => {
            resolve(event.data.code);
}, false);
        worker.postMessage({
            args: [esmCode, rollupOutputOptions],
        });
    });
} 

export const toSystemjs = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    if (typeof Worker !== 'undefined') {
        return toSystemjsWorker(esmCode, rollupOutputOptions);
    }
    return toSystemjsMain(esmCode, rollupOutputOptions);
}
