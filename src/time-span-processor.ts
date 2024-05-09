import {
    addHrTimes,
    millisToHrTime,
    NoopSpanProcessor,
    ReadableSpan,
} from '../deps.ts';

const LIMIT = new Date('2020-01-01').getTime() / 1000;
const isMonotonicHrTime = (hrTime: [number, number]): boolean =>
    hrTime[0] < LIMIT;
// @ts-ignore
const variableTimeOrigin = () => new Date() - performance.now();

export class TimeSpanProcessor extends NoopSpanProcessor {
    onEnd(span: ReadableSpan): void {
        if (!isMonotonicHrTime(span.startTime)) {
            return;
        }
        const hrTime = millisToHrTime(variableTimeOrigin());
        // @ts-ignore
        span.startTime = addHrTimes(span.startTime, hrTime);
        // @ts-ignore
        span.endTime = addHrTimes(span.endTime, hrTime);
        for (const event of span.events) {
            event.time = addHrTimes(event.time, hrTime);
        }
    }
}
