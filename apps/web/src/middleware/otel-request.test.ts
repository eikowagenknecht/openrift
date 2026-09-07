import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { activeClientIp } from "@/lib/server-fns/client-ip-context";

import { otelRequestMiddleware } from "./otel-request";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterAll(async () => {
  contextManager.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
  propagation.disable();
});

afterEach(() => {
  exporter.reset();
});

// oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- the middleware always has a server handler
const handler = otelRequestMiddleware.options.server!;

describe("otelRequestMiddleware (web)", () => {
  it("opens an http.server span named after method + path", async () => {
    await handler({
      request: new Request("https://example.com/cards/abc"),
      next: async () => undefined,
    } as never);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("GET /cards/abc");
    expect(spans[0]?.attributes).toMatchObject({
      "http.request.method": "GET",
      "url.path": "/cards/abc",
    });
  });

  it("links the span to an incoming W3C traceparent", async () => {
    const incomingTraceId = "0af7651916cd43dd8448eb211c80319c";
    const incomingSpanId = "b7ad6b7169203331";
    const traceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

    await handler({
      request: new Request("https://example.com/cards", { headers: { traceparent } }),
      next: async () => undefined,
    } as never);

    const span = exporter.getFinishedSpans()[0];
    expect(span?.spanContext().traceId).toBe(incomingTraceId);
    expect(span?.parentSpanContext?.spanId).toBe(incomingSpanId);
  });

  it("activates the span context so child spans inherit it", async () => {
    const tracer = trace.getTracer("test");
    let capturedTraceId: string | undefined;

    await handler({
      request: new Request("https://example.com/cards"),
      next: async () => {
        const childSpan = tracer.startSpan("child");
        capturedTraceId = childSpan.spanContext().traceId;
        childSpan.end();
        return undefined;
      },
    } as never);

    const parent = exporter.getFinishedSpans().find((span) => span.name === "GET /cards");
    expect(capturedTraceId).toBeDefined();
    expect(capturedTraceId).toBe(parent?.spanContext().traceId);
  });

  it("marks the span as ERROR and records the exception when next() throws", async () => {
    await expect(
      handler({
        request: new Request("https://example.com/oops"),
        next: async () => {
          throw new Error("kaboom");
        },
      } as never),
    ).rejects.toThrow("kaboom");

    const span = exporter.getFinishedSpans()[0];
    expect(span?.status.code).toBe(2);
    expect(span?.events.some((event) => event.name === "exception")).toBe(true);
  });

  it("lifts the X-Real-IP header onto the context for outbound API calls", async () => {
    let seenDuringRequest: string | undefined;

    await handler({
      request: new Request("https://example.com/cards", {
        headers: { "x-real-ip": "203.0.113.7" },
      }),
      next: async () => {
        seenDuringRequest = activeClientIp();
        return undefined;
      },
    } as never);

    expect(seenDuringRequest).toBe("203.0.113.7");
    const span = exporter.getFinishedSpans()[0];
    expect(span?.attributes["client.address"]).toBe("203.0.113.7");
    expect(activeClientIp()).toBeUndefined();
  });

  it("leaves the context IP unset when the request has no X-Real-IP", async () => {
    let seenDuringRequest: string | undefined = "sentinel";

    await handler({
      request: new Request("https://example.com/cards"),
      next: async () => {
        seenDuringRequest = activeClientIp();
        return undefined;
      },
    } as never);

    expect(seenDuringRequest).toBeUndefined();
    const span = exporter.getFinishedSpans()[0];
    expect(span?.attributes["client.address"]).toBeUndefined();
  });

  it("makes the active span available to propagation.inject (for outbound fetch)", async () => {
    let injected: Record<string, string> | undefined;

    await handler({
      request: new Request("https://example.com/cards"),
      next: async () => {
        const headers: Record<string, string> = {};
        propagation.inject(context.active(), headers);
        injected = headers;
        return undefined;
      },
    } as never);

    expect(injected?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-/u);
  });
});
