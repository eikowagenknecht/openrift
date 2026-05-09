import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { otelRequestMiddleware } from "./otel-request.js";

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

describe("otelRequestMiddleware", () => {
  it("records the matched route template, not the raw path", async () => {
    const app = new Hono();
    app.use("/api/*", otelRequestMiddleware);
    app.get("/api/cards/:cardSlug", (c) => c.json({ ok: true }));

    const res = await app.request("/api/cards/abc-123");
    expect(res.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("GET /api/cards/:cardSlug");
    expect(spans[0]?.attributes).toMatchObject({
      "http.request.method": "GET",
      "http.route": "/api/cards/:cardSlug",
      "url.path": "/api/cards/abc-123",
      "http.response.status_code": 200,
    });
  });

  it("falls back to <unmatched> when no route matched", async () => {
    const app = new Hono();
    app.use("/api/*", otelRequestMiddleware);

    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.attributes["http.route"]).toBe("<unmatched>");
  });

  it("links the span to an incoming W3C traceparent", async () => {
    const incomingTraceId = "0af7651916cd43dd8448eb211c80319c";
    const incomingSpanId = "b7ad6b7169203331";
    const traceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

    const app = new Hono();
    app.use("/api/*", otelRequestMiddleware);
    app.get("/api/cards/:cardSlug", (c) => c.json({ ok: true }));

    const res = await app.request("/api/cards/abc-123", {
      headers: { traceparent },
    });
    expect(res.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.spanContext().traceId).toBe(incomingTraceId);
    expect(spans[0]?.parentSpanContext?.spanId).toBe(incomingSpanId);
  });

  it("starts a fresh trace when no traceparent header is present", async () => {
    const app = new Hono();
    app.use("/api/*", otelRequestMiddleware);
    app.get("/api/cards/:cardSlug", (c) => c.json({ ok: true }));

    await app.request("/api/cards/abc-123");

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.parentSpanContext).toBeUndefined();
  });

  it("marks the span as ERROR on 5xx responses", async () => {
    const app = new Hono();
    app.use("/api/*", otelRequestMiddleware);
    app.get("/api/oops", (c) => c.json({ error: "boom" }, 500));

    const res = await app.request("/api/oops");
    expect(res.status).toBe(500);

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(2); // ERROR
    expect(spans[0]?.attributes["http.response.status_code"]).toBe(500);
  });
});
