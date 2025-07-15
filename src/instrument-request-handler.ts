import { default as opentelemetry, SpanKind } from '@opentelemetry/api';

import {
    BasicTracerProvider,
    type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import type {
    OpenTelemetry,
    PartialServerTimingSpanExporter,
} from './types.ts';

export const instrumentRequestHandler = <T extends Deno.ServeHandler>(
    requestHandler: T,
    otel: OpenTelemetry = opentelemetry,
): T => {
    const tracer = otel.trace.getTracer('web');

    const spanProcessor: SpanProcessor | undefined =
        (tracer as unknown as BasicTracerProvider).getActiveSpanProcessor?.();
    let serverTimingExporter: PartialServerTimingSpanExporter = {
        getServerTimingHeader: () => ['Server-Timing', ''],
    };
    // @ts-ignore private access to MultiSpanProcessor _spanProcessors prop
    const spanProcessors: SpanProcessor[] =
        spanProcessor && '_spanProcessors' in spanProcessor
            ? spanProcessor._spanProcessors
            : [spanProcessor];
    for (const processor of spanProcessors) {
        if (
            processor && '_exporter' in processor &&
            // @ts-ignore private access to SimpleSpanProcessor _exporter prop
            'getServerTimingHeader' in processor._exporter
        ) {
            serverTimingExporter = processor
                ._exporter as PartialServerTimingSpanExporter;
            break;
        }
    }

    const instrumentedRequestHandler: Deno.ServeHandler = async (
        req: Request,
        info: Deno.ServeHandlerInfo,
    ): Promise<Response> => {
        const plainHeaders: Record<string, string> = {};
        const attributes: Record<string, string> = {
            'http.client_ip':
                (req.headers.get('x-forwarded-for') ?? '').split(',')
                    .shift() ??
                    // @ts-ignore
                    info.remoteAddr?.hostname ?? '',
            'http.method': req.method,
            'http.useragent': req.headers.get('user-agent') ?? '',
            'http.url': req.url,
            'operation.name': 'web.request',
            'span.type': 'web',
        };
        for (const [key, value] of req.headers.entries()) {
            plainHeaders[key] = value;
            attributes[`http.request.headers.${key}`] = value;
        }
        // Extract context from incoming HTTP headers
        const activeContext = otel.context.active();
        const extractedContext = otel.propagation.extract(
            activeContext,
            plainHeaders,
        );
        // Create a new root span for this request
        const requestSpan = tracer.startSpan('total', {
            attributes,
            kind: SpanKind.SERVER,
        }, extractedContext);

        // Create a new context from the current context which has the span "active"
        const requestContext = otel.trace.setSpan(
            activeContext,
            requestSpan,
        );

        const response = await otel.context.with(
            requestContext,
            requestHandler as Deno.ServeHandler,
            undefined,
            // arguments for "requestHandler" follow
            req,
            info,
        );

        requestSpan.setAttribute('http.status_code', response.status);
        requestSpan.end();

        response.headers.set(
            ...serverTimingExporter.getServerTimingHeader(requestSpan, {
                precision: 1,
            }),
        );

        return response;
    };

    return instrumentedRequestHandler as T;
};
