import { BasicTracerProvider, millisToHrTime } from '../deps.ts';

export const getTime = () => millisToHrTime(performance.now());

/**
 * An extension of the stock BasicTracerProvider that patches
 * the span creation/ending to always inject start and end times.
 *
 * The injected start/end times are HrTime from the monotonic clock.
 *
 * Usually those times would need to be converted into wall-clock
 * when exported.
 */
export class CustomTracerProvider extends BasicTracerProvider {
    private PATCH_TYPE = Symbol('@@patch');
    getTracer(name: string, version?: string, options?: {
        schemaUrl?: string;
    }) {
        const tracer = super.getTracer(name, version, options);
        // @ts-ignore
        if (tracer[this.PATCH_TYPE]) {
            return tracer;
        }
        const _startSpan = tracer.startSpan.bind(tracer);
        const _startActiveSpan = tracer.startActiveSpan.bind(tracer);
        const startSpan: typeof _startSpan = function __startSpan(
            name,
            options?,
            context?,
        ) {
            const actualOptions = options ?? {};
            if (!actualOptions.startTime) {
                actualOptions.startTime = getTime();
            }
            const span = _startSpan(name, actualOptions, context);
            const _end = span.end.bind(span);
            const _addEvent = span.addEvent.bind(span);
            const end: typeof _end = function __end(endTime?) {
                const effectiveEndTime = endTime ?? getTime();
                return _end(effectiveEndTime);
            };
            const addEvent: typeof _addEvent = function __addEvent(
                name,
                attributesOrStartTime,
                startTime,
            ) {
                const missingStartTime = typeof startTime !== undefined;
                typeof attributesOrStartTime === 'number' ||
                    Array.isArray(attributesOrStartTime) ||
                    attributesOrStartTime instanceof Date;
                if (!missingStartTime) {
                    return _addEvent(name, attributesOrStartTime, startTime);
                }
                return _addEvent(name, attributesOrStartTime, getTime());
            };
            span.end = end;
            span.addEvent = addEvent;
            return span;
        };
        const startActiveSpan: typeof _startActiveSpan =
            function __startActiveSpan(
                name,
                optionsOrFn,
                fnOrContext?: any,
                fn?: any,
            ) {
                if (typeof optionsOrFn === 'function') {
                    return _startActiveSpan(
                        name,
                        { startTime: getTime() },
                        optionsOrFn,
                    );
                }
                const actualOptions = optionsOrFn ?? {};
                if (!actualOptions.startTime) {
                    actualOptions.startTime = getTime();
                }
                return _startActiveSpan(name, actualOptions, fnOrContext, fn);
            };
        tracer.startSpan = startSpan;
        tracer.startActiveSpan = startActiveSpan;
        // @ts-ignore
        tracer[this.PATCH_TYPE] = true;
        return tracer;
    }
}
