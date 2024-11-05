import opentelemetry from '@opentelemetry/api';
import { type Pool } from 'generic-pool';
import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup as _rollup,
    VERSION as _rollupVersion,
} from 'rollup';
import type { BuildResult, SourceModule } from './types.ts';
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
        const mod = await import('npm:rollup@4.24.0');
        // @ts-ignore
        rollup = mod.rollup;
        rollupVersion = mod.VERSION;
    } catch { /* empty */ }
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
        compact: true,
        ...rollupOutputOptions,
        footer: `/* rollup@${rollupVersion}${
            rollupOutputOptions.footer ? ` - ${rollupOutputOptions.footer}` : ''
        } */\n`,
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
    workerPool: Pool<Worker>,
    sourceModule: string | SourceModule,
    rollupOutputOptions: OutputOptions = {},
): Promise<BuildResult> => {
    const tracer = opentelemetry.trace.getTracer('web');
    const workerAcquireSpan = tracer.startSpan('worker-acquire');
    const worker = await workerPool.acquire();
    workerAcquireSpan.end();

    return new Promise((resolve) => {
        worker.addEventListener(
            'message',
            async function end(event: MessageEvent<{ build: BuildResult }>) {
                worker.removeEventListener('message', end);
                await workerPool.release(worker);
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
    workerPool?: Pool<Worker>,
): Promise<BuildResult> => {
    if (workerPool) {
        return toSystemjsWorker(
            workerPool,
            sourceModule,
            {
                footer: '(worker)',
                ...rollupOutputOptions,
            },
        );
    }
    return toSystemjsMain(sourceModule, rollupOutputOptions);
};
