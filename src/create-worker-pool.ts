import opentelemetry from '@opentelemetry/api';
import { createPool, type Options, type Pool } from 'generic-pool';
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
    const pool = createPool(poolFactory, options);
    if (config.OTEL_EXPORTER_ENABLE) {
        const meter = otel.metrics.getMeter('web');
        const keys = ['available', 'borrowed', 'pending'] as const;
        const gauges = Object.fromEntries(
            keys.map((key) => [key, meter.createGauge(`app.workers.${key}`)]),
        );
        const recordMetrics = () => {
            for (const key of keys) {
                gauges[key].record(pool[key]);
            }
        };
        const recordMetricsTimer = setInterval(recordMetrics, 1000);
        const _clear = pool.clear.bind(pool);
        pool.clear = (): Promise<void> => {
            clearInterval(recordMetricsTimer);
            return _clear();
        };
        return new Proxy(pool, {
            get(
                target: Pool<Worker>,
                p: string | symbol,
                receiver: any,
            ): any {
                recordMetrics();
                return Reflect.get(target, p, receiver);
            },
        });
    }
    return pool;
}
