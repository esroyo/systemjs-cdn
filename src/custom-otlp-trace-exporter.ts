import { addHrTimes, millisToHrTime } from '@opentelemetry/core';
import { type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const LIMIT = new Date('2000-01-01').getTime() / 1000;
const isMonotonicHrTime = (hrTime: [number, number]): boolean =>
    hrTime[0] < LIMIT;
const variableTimeOrigin = () => Date.now() - performance.now();

/**
 * An extension of the stock OTLPTraceExporter to convert the
 * span times from monotonic clock to wall clock.
 */
export class CustomOTLPTraceExporter extends OTLPTraceExporter {
    override export(
        spans: ReadableSpan[],
        resultCallback: (result: any) => void,
    ): void {
        // Current timeOrigin
        const hrTime = millisToHrTime(variableTimeOrigin());
        // Just before exporting
        for (const span of spans) {
            // Only if the spans were created with the monotonic clock
            if (!isMonotonicHrTime(span.startTime)) {
                return;
            }
            // Convert the times to wall-clock
            // @ts-ignore read-only prop
            span.startTime = addHrTimes(span.startTime, hrTime);
            // @ts-ignore read-only prop
            span.endTime = addHrTimes(span.endTime, hrTime);
            for (const event of span.events) {
                event.time = addHrTimes(event.time, hrTime);
            }
        }
        // And proceed to the regular export
        return super.export(spans, resultCallback);
    }
}
