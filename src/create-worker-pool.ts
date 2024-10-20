import genericPool, { type Options } from 'generic-pool';
import { Config } from './types.ts';

export function createWorkerPool(
    config: Config,
    options: Options = {},
) {
    if (!options.max) {
        options.max = config.WORKER_MAX;
    }
    if (!options.min) {
        options.min = config.WORKER_MIN;
    }
    const poolFactory = {
        async create(): Promise<Worker> {
            return new Worker(import.meta.resolve('./to-systemjs-worker.ts'), {
                type: 'module',
            });
        },
        async destroy(worker: Worker): Promise<void> {
            worker.terminate();
        },
    };

    return genericPool.createPool(poolFactory, options);
}
