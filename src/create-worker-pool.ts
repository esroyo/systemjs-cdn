import opentelemetry from '@opentelemetry/api';
import genericPool, { type Options } from 'generic-pool';
import type { Config, OpenTelemetry } from './types.ts';

export function createWorkerPool(
    config: Config,
    options: Options = {},
    otel: OpenTelemetry = opentelemetry,
) {
    if (!options.max) {
        options.max = config.WORKER_MAX;
    }
    if (!options.min) {
        options.min = config.WORKER_MIN;
    }
    if (!options.evictionRunIntervalMillis) {
        options.evictionRunIntervalMillis = 60 * 1000;
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
    const pool = genericPool.createPool(poolFactory, options);
    if (config.OTEL_EXPORTER_ENABLE) {
        const meter = otel.metrics.getMeter('web');
        const keys = ['available', 'borrowed', 'pending'] as const;
        const gauges = Object.fromEntries(
            keys.map((key) => [key, meter.createGauge(`workers.${key}`)]),
        );
        const record = () => {
            for (const key of keys) {
                gauges[key].record(pool[key]);
            }
        };
        const timer = setInterval(record, 1000);
        const _acquire = pool.acquire.bind(pool);
        const _clear = pool.clear.bind(pool);
        pool.acquire = (priority?: number): Promise<any> => {
            record();
            return _acquire(priority);
        };
        pool.clear = (): Promise<void> => {
            clearInterval(timer);
            return _clear();
        };
    }
    return pool;
}
