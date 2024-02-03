import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup as _rollup,
    rollupPluginVirtual,
    rollupVersion as _rollupVersion,
} from '../deps.ts';

export const toSystemjsMain = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    let rollup = _rollup;
    let rollupVersion = _rollupVersion;
    try {
        const mod = await import('npm:rollup@4.9.6');
        // @ts-ignore
        rollup = mod.rollup;
        rollupVersion = mod.VERSION;
    } catch (_) {}
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
        footer: `/* rollup@${rollupVersion} */`,
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
    const worker = new Worker(import.meta.resolve('./to-systemjs-worker.ts'), {
        type: 'module',
    });
    return new Promise((resolve) => {
        worker.addEventListener(
            'message',
            (event: MessageEvent<{ code: string }>) => {
                worker.terminate();
                resolve(event.data.code);
            },
            false,
        );
        worker.postMessage({
            args: [esmCode, rollupOutputOptions],
        });
    });
};

export const toSystemjs = async (
    esmCode: string,
    rollupOutputOptions: OutputOptions = {},
): Promise<string> => {
    if (typeof Worker !== 'undefined') {
        return toSystemjsWorker(esmCode, rollupOutputOptions);
    }
    return toSystemjsMain(esmCode, rollupOutputOptions);
};
