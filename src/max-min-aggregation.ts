import {
    AggregationTemporality,
    DataPointType,
    GaugeMetricData,
    MetricData,
    MetricDescriptor,
} from '@opentelemetry/sdk-metrics';
import type { Attributes, HrTime } from '@opentelemetry/api';

type Maybe<T> = T | undefined;
type MaxMin = number;
type AccumulationRecord<T> = [Attributes, T];
/**
 * An Aggregator accumulation state.
 */
interface Accumulation {
    setStartTime(startTime: HrTime): void;
    record(value: number): void;
}
/**
 * Configures how measurements are combined into metrics for views.
 *
 * Aggregation provides a set of built-in aggregations via static methods.
 */
interface Aggregation {
    createAggregator(
        instrument: MetricDescriptor,
    ): Aggregator<Maybe<Accumulation>>;
}
/** The kind of aggregator. */
enum AggregatorKind {
    DROP,
    SUM,
    LAST_VALUE,
    HISTOGRAM,
    EXPONENTIAL_HISTOGRAM,
}
interface Aggregator<T> {
    /** The kind of the aggregator. */
    kind: AggregatorKind;

    /**
     * Create a clean state of accumulation.
     */
    createAccumulation(startTime: HrTime): T;

    /**
     * Returns the result of the merge of the given accumulations.
     *
     * This should always assume that the accumulations do not overlap and merge together for a new
     * cumulative report.
     *
     * @param previous the previously captured accumulation
     * @param delta the newly captured (delta) accumulation
     * @returns the result of the merge of the given accumulations
     */
    merge(previous: T, delta: T): T;

    /**
     * Returns a new DELTA aggregation by comparing two cumulative measurements.
     *
     * @param previous the previously captured accumulation
     * @param current the newly captured (cumulative) accumulation
     * @returns The resulting delta accumulation
     */
    diff(previous: T, current: T): T;

    /**
     * Returns the {@link MetricData} that this {@link Aggregator} will produce.
     *
     * @param descriptor the metric descriptor.
     * @param aggregationTemporality the temporality of the resulting {@link MetricData}
     * @param accumulationByAttributes the array of attributes and accumulation pairs.
     * @param endTime the end time of the metric data.
     * @return the {@link MetricData} that this {@link Aggregator} will produce.
     */
    toMetricData(
        descriptor: MetricDescriptor,
        aggregationTemporality: AggregationTemporality,
        accumulationByAttributes: AccumulationRecord<T>[],
        endTime: HrTime,
    ): Maybe<MetricData>;
}

export class MaxAccumulation implements Accumulation {
    constructor(
        public startTime: HrTime,
        protected _current: number = NaN,
    ) {}

    record(value: number): void {
        if (Number.isNaN(this._current) || value > this._current) {
            this._current = value;
        }
    }

    setStartTime(startTime: HrTime): void {
        this.startTime = startTime;
    }

    toPointValue(): MaxMin {
        return this._current;
    }
}

export class MinAccumulation implements Accumulation {
    constructor(
        public startTime: HrTime,
        protected _current: number = NaN,
    ) {}

    record(value: number): void {
        if (Number.isNaN(this._current) || value < this._current) {
            this._current = value;
        }
    }

    setStartTime(startTime: HrTime): void {
        this.startTime = startTime;
    }

    toPointValue(): MaxMin {
        return this._current;
    }
}

type MaxMinAccumulation = MaxAccumulation | MinAccumulation;

/** Basic aggregator which calculates a Max from individual measurements. */
export class MaxMinAggregator implements Aggregator<MaxMinAccumulation> {
    public kind = AggregatorKind.LAST_VALUE;
    protected _accumulationConstructable = {
        max: MaxAccumulation,
        min: MinAccumulation,
    };
    protected get _accumulationConstructor() {
        return this._accumulationConstructable[this._mathMethod];
    }

    constructor(
        protected _mathMethod: 'max' | 'min' = 'max',
    ) {}

    createAccumulation(startTime: HrTime) {
        return new this._accumulationConstructor(startTime);
    }

    /**
     * Returns the result of the merge of the given accumulations.
     */
    merge(
        previous: MaxMinAccumulation,
        delta: MaxMinAccumulation,
    ): MaxMinAccumulation {
        // const prevPv = previous.toPointValue();
        const deltaPv = delta.toPointValue();
        return new this._accumulationConstructor(
            previous.startTime,
            deltaPv,
        );
    }

    /**
     * Returns a new DELTA aggregation by comparing two cumulative measurements.
     */
    diff(
        previous: MaxMinAccumulation,
        current: MaxMinAccumulation,
    ): MaxMinAccumulation {
        const prevPv = previous.toPointValue();
        const currPv = current.toPointValue();
        return new this._accumulationConstructor(
            current.startTime,
            currPv - prevPv,
        );
    }

    toMetricData(
        descriptor: MetricDescriptor,
        aggregationTemporality: AggregationTemporality,
        accumulationByAttributes: AccumulationRecord<MaxMinAccumulation>[],
        endTime: HrTime,
    ): Maybe<GaugeMetricData> {
        const value = {
            descriptor,
            aggregationTemporality,
            dataPointType: DataPointType.GAUGE,
            dataPoints: accumulationByAttributes.map(
                ([attributes, accumulation]) => {
                    return {
                        attributes,
                        startTime: accumulation.startTime,
                        endTime,
                        value: accumulation.toPointValue(),
                    };
                },
            ),
        };
        return value;
    }
}

/**
 * The default last value aggregation.
 */
export class MaxAggregation implements Aggregation {
    private static DEFAULT_INSTANCE = new MaxMinAggregator('max');
    createAggregator(_instrument: MetricDescriptor) {
        return MaxAggregation.DEFAULT_INSTANCE;
    }
}

/**
 * The default last value aggregation.
 */
export class MinAggregation implements Aggregation {
    private static DEFAULT_INSTANCE = new MaxMinAggregator('min');
    createAggregator(_instrument: MetricDescriptor) {
        return MinAggregation.DEFAULT_INSTANCE;
    }
}
