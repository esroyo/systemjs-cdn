import { BasicTracerProvider } from '../deps.ts';
import { getTime } from './utils.ts';

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
        const startSpan: typeof _startSpan = function startSpanPatch(
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
            const end: typeof _end = function endPatch(endTime?) {
                const effectiveEndTime = endTime ?? getTime();
                return _end(effectiveEndTime);
            };
            span.end = end;
            return span;
        };
        tracer.startSpan = startSpan;
        // @ts-ignore
        tracer[this.PATCH_TYPE] = true;
        return tracer;
    }
}
