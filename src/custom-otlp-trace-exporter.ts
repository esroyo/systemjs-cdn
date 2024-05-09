import {
    addHrTimes,
    millisToHrTime,
    OTLPTraceExporter,
    ReadableSpan,
} from '../deps.ts';

const LIMIT = new Date('2000-01-01').getTime() / 1000;
const isMonotonicHrTime = (hrTime: [number, number]): boolean =>
    hrTime[0] < LIMIT;
// @ts-ignore
const variableTimeOrigin = () => new Date() - performance.now();

export class CustomOTLPTraceExporter extends OTLPTraceExporter {
    export(spans: ReadableSpan[], resultCallback: (result: any) => void): void {
        // Current timeOrigin
        const hrTime = millisToHrTime(variableTimeOrigin());
        // Just before exporting
        for (const span of spans) {
            // Only if the spans were created with the monotonic clock
            if (!isMonotonicHrTime(span.startTime)) {
                return;
            }
            // Convert the times to wall-clock
            // @ts-ignore
            span.startTime = addHrTimes(span.startTime, hrTime);
            // @ts-ignore
            span.endTime = addHrTimes(span.endTime, hrTime);
            for (const event of span.events) {
                event.time = addHrTimes(event.time, hrTime);
            }
        }
        // And proceed to the regular export
        return super.export(spans, resultCallback);
    }
}
