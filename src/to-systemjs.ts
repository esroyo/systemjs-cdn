import opentelemetry from '@opentelemetry/api';
import { type Pool } from 'generic-pool';
import {
    InputOptions,
    ModuleFormat,
    OutputOptions,
    rollup as _rollup,
    VERSION as _rollupVersion,
} from 'rollup';
import type { BuildResult, RollupOptions, SourceModule } from './types.ts';
import rollupPluginVirtual from './rollup-plugin-virtual.ts';
import { addCommandPluginsToInputOptions } from 'rollup/dist/shared/loadConfigFile.js';

export const toSystemjsMain = async (
    sourceModule: string | SourceModule,
    rollupOptions: RollupOptions = {},
    signal?: AbortSignal,
): Promise<BuildResult> => {
    signal?.throwIfAborted();

    let rollup = _rollup;
    let rollupVersion = _rollupVersion;
    const mod = typeof sourceModule === 'string'
        ? { code: sourceModule, name: 'code' }
        : sourceModule;
    try {
        const mod = await import('npm:rollup@4.39.0');
        // @ts-ignore
        rollup = mod.rollup;
        rollupVersion = mod.VERSION;
    } catch { /* empty */ }
    const inputOptions: InputOptions = {
        external: () => true,
        input: mod.name,
        makeAbsoluteExternalsRelative: false,
        plugins: [
            rollupPluginVirtual({ [mod.name]: mod }),
        ],
        treeshake: false,
    };
    // "plugin" as in the CLI option
    if (rollupOptions.plugin) {
        addCommandPluginsToInputOptions(inputOptions, {
            plugin: rollupOptions.plugin,
        });
    }

    const outputOptions: OutputOptions = {
        dir: 'out', // not really used
        format: 'systemjs' as ModuleFormat,
        compact: true,
        ...rollupOptions.output,
        footer: `/* rollup@${rollupVersion}${
            rollupOptions.output?.footer
                ? ` - ${rollupOptions.output.footer}`
                : ''
        } */\n`,
    };

    signal?.throwIfAborted();

    const bundle = await rollup(inputOptions);

    signal?.throwIfAborted();

    const { output } = await bundle.generate(outputOptions);

    signal?.throwIfAborted();

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
    rollupOptions: RollupOptions = {},
    signal?: AbortSignal,
): Promise<BuildResult> => {
    const tracer = opentelemetry.trace.getTracer('web');
    const workerAcquireSpan = tracer.startSpan('worker-acquire');
    const worker = await workerPool.acquire();
    workerAcquireSpan.end();

    return new Promise((resolve, reject) => {
        const onAbort = async (ev: Event) => {
            await workerPool.destroy(worker);
            const reason = (ev.target as AbortSignal).reason;
            const error = reason instanceof Error
                ? reason
                : new DOMException(reason ?? 'AbortError', 'AbortError');
            reject(error);
        };
        signal?.addEventListener('abort', onAbort);
        worker.addEventListener(
            'message',
            async function end(event: MessageEvent<{ build: BuildResult }>) {
                worker.removeEventListener('message', end);
                signal?.removeEventListener('abort', onAbort);
                await workerPool.release(worker);
                resolve(event.data.build);
            },
            false,
        );
        worker.postMessage({
            args: [sourceModule, rollupOptions],
        });
    });
};

export const toSystemjs = async (
    sourceModule: string | SourceModule,
    rollupOptions: RollupOptions = {},
    workerPool?: Pool<Worker>,
    signal?: AbortSignal,
): Promise<BuildResult> => {
    if (workerPool) {
        return toSystemjsWorker(
            workerPool,
            sourceModule,
            {
                ...rollupOptions,
                output: {
                    footer: '(worker)',
                    ...rollupOptions.output,
                },
            },
            signal,
        );
    }
    return toSystemjsMain(sourceModule, rollupOptions, signal);
};
