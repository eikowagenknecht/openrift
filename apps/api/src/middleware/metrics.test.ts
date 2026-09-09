import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMetricsMiddleware } from "./metrics.js";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(async () => {
  contextManager.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
});

const tracer = trace.getTracer("test");

describe("createMetricsMiddleware", () => {
  it("records counter and histogram with the matched route template", async () => {
    const { registerMetrics, registry } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", registerMetrics);
    app.get("/api/cards/:cardSlug", (c) => c.json({ ok: true }));

    const res = await app.request("/api/cards/abc-123");
    expect(res.status).toBe(200);

    const body = await registry.metrics();
    expect(body).toContain(
      'http_requests_total{method="GET",route="/api/cards/:cardSlug",status="200",ok="true"} 1',
    );
    expect(body).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/api\/cards\/:cardSlug",status="200",ok="true"\} 1/u,
    );
  });

  it("emits exemplars carrying the active trace ID when a span is active", async () => {
    const { registerMetrics, registry } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", async (_c, next) => {
      const span = tracer.startSpan("test span");
      await context.with(trace.setSpan(context.active(), span), async () => {
        await next();
      });
      span.end();
    });
    app.use("*", registerMetrics);
    app.get("/api/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);

    const body = await registry.metrics();
    // OpenMetrics exemplar line format: `# {traceID="..."} value timestamp`.
    expect(body).toMatch(/# \{traceID="[0-9a-f]{32}"\} \S+/u);
    expect(body.trimEnd().endsWith("# EOF")).toBe(true);
  });

  it("omits exemplars when no span is active", async () => {
    const { registerMetrics, registry } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", registerMetrics);
    app.get("/api/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);

    const body = await registry.metrics();
    expect(body).not.toMatch(/# \{traceID=/u);
  });

  it("records the proxy-to-handler delay from x-request-start", async () => {
    const { registerMetrics, registry } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", registerMetrics);
    app.get("/api/ping", (c) => c.json({ ok: true }));

    const forwardedAt = (Date.now() - 3000) / 1000;
    const res = await app.request("/api/ping", {
      headers: { "x-request-start": String(forwardedAt) },
    });
    expect(res.status).toBe(200);

    const body = await registry.metrics();
    expect(body).toContain('http_upstream_delay_seconds_count{method="GET",route="/api/ping"} 1');
    // The 3s gap lands above the 2.5s bucket and below the 5s one.
    expect(body).toContain('http_upstream_delay_seconds_bucket{le="2.5"');
    expect(body).toMatch(
      /http_upstream_delay_seconds_bucket\{le="5",method="GET",route="\/api\/ping"\} 1/u,
    );
  });

  it("skips the delay metric when the header is absent, unparseable or implausible", async () => {
    const { registerMetrics, registry } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", registerMetrics);
    app.get("/api/ping", (c) => c.json({ ok: true }));

    await app.request("/api/ping");
    await app.request("/api/ping", { headers: { "x-request-start": "not-a-number" } });
    // A forged header from the future, and one older than any real request.
    await app.request("/api/ping", {
      headers: { "x-request-start": String((Date.now() + 60_000) / 1000) },
    });
    await app.request("/api/ping", { headers: { "x-request-start": "1" } });

    const body = await registry.metrics();
    expect(body).not.toMatch(/http_upstream_delay_seconds_count\{[^}]*\} [1-9]/u);
  });

  it("exposes render pool depth when a stats source is supplied", async () => {
    const { registry } = createMetricsMiddleware({
      collectDefaults: false,
      renderStats: () => ({ queued: 4, active: 2, workers: 2 }),
    });

    const body = await registry.metrics();

    expect(body).toContain("render_pool_queued 4");
    expect(body).toContain("render_pool_active 2");
    expect(body).toContain("render_pool_workers 2");
  });

  it("omits the render pool gauges when no stats source is supplied", async () => {
    const { registry } = createMetricsMiddleware({ collectDefaults: false });

    const body = await registry.metrics();

    expect(body).not.toContain("render_pool_queued");
  });

  it("serves /metrics with the OpenMetrics content type", async () => {
    const { registerMetrics, printMetrics } = createMetricsMiddleware({ collectDefaults: false });

    const app = new Hono();
    app.use("*", registerMetrics);
    app.get("/metrics", printMetrics);
    app.get("/api/ping", (c) => c.json({ ok: true }));

    await app.request("/api/ping");
    const res = await app.request("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/openmetrics-text");
  });
});
