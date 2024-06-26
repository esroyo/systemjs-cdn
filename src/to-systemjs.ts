import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup as _rollup,
    rollupVersion as _rollupVersion,
} from '../deps.ts';
import type { BuildResult, Config, SourceModule } from './types.ts';
import rollupPluginVirtual from './rollup-plugin-virtual.ts';

export const toSystemjsMain = async (
    sourceModule: string | SourceModule,
    rollupOutputOptions: OutputOptions = {},
): Promise<BuildResult> => {
    let rollup = _rollup;
    let rollupVersion = _rollupVersion;
    const mod = typeof sourceModule === 'string'
        ? { code: sourceModule, name: 'code' }
        : sourceModule;
    try {
        const mod = await import('npm:rollup@4.16.4');
        // @ts-ignore
        rollup = mod.rollup;
        rollupVersion = mod.VERSION;
    } catch (_) {}
    const inputOptions: InputOptions = {
        external: () => true,
        input: mod.name,
        plugins: [
            rollupPluginVirtual({ [mod.name]: mod }),
        ],
        treeshake: false,
    };

    const outputOptions: OutputOptions = {
        dir: 'out', // not really used
        format: 'systemjs' as ModuleFormat,
        sourcemap: mod.map ? 'inline' : false,
        ...rollupOutputOptions,
        footer: `/* rollup@${rollupVersion}${
            rollupOutputOptions.footer ? ` - ${rollupOutputOptions.footer}` : ''
        } */`,
    };

    const bundle = await rollup(inputOptions);
    const { output } = await bundle.generate(outputOptions);
    await bundle.close();
    return {
        code: output[0].code,
        map: output[1] && output[1].type === 'asset' &&
                typeof output[1].source === 'string'
            ? output[1].source
            : undefined,
    };
};

export const toSystemjsWorker = async (
    sourceModule: string | SourceModule,
    rollupOutputOptions: OutputOptions = {},
): Promise<BuildResult> => {
    const worker = new Worker(import.meta.resolve('./to-systemjs-worker.ts'), {
        type: 'module',
    });
    return new Promise((resolve) => {
        worker.addEventListener(
            'message',
            (event: MessageEvent<{ build: BuildResult }>) => {
                worker.terminate();
                resolve(event.data.build);
            },
            false,
        );
        worker.postMessage({
            args: [sourceModule, rollupOutputOptions],
        });
    });
};

export const toSystemjs = async (
    sourceModule: string | SourceModule,
    rollupOutputOptions: OutputOptions = {},
    options?: Pick<Config, 'WORKER_ENABLE'>,
): Promise<BuildResult> => {
    if (options?.WORKER_ENABLE && typeof Worker !== 'undefined') {
        return toSystemjsWorker(sourceModule, {
            footer: '(worker)',
            ...rollupOutputOptions,
        });
    }
    return toSystemjsMain(sourceModule, rollupOutputOptions);
};
