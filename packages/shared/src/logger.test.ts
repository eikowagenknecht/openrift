import type { SpanContext } from "@opentelemetry/api";
import { context, trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";

import { createLogger, traceContextMixin } from "./logger";

describe("createLogger", () => {
  it("creates a logger with standard methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("defaults to info level", () => {
    const log = createLogger("test");
    expect(log.level).toBe("info");
  });

  it("accepts a custom level", () => {
    const log = createLogger("test", "debug");
    expect(log.level).toBe("debug");
  });
});

describe("traceContextMixin", () => {
  it("returns an empty object when no span is active", () => {
    expect(traceContextMixin()).toEqual({});
  });

  it("returns an empty object when the span context is invalid (no SDK)", () => {
    // The no-op tracer returns a span whose context is all zeros. The mixin
    // must not emit that — Loki would treat it as a real ID and create a
    // useless link.
    const tracer = trace.getTracer("test");
    const span = tracer.startSpan("op");
    const ctx = trace.setSpan(context.active(), span);
    const result = context.with(ctx, traceContextMixin);
    expect(result).toEqual({});
    span.end();
  });

  it("returns trace_id and span_id when an SDK-issued span is active", () => {
    // Simulate an SDK-issued span by stubbing getActiveSpan with a span that
    // exposes a real-looking context. The mixin only reads spanContext(); we
    // don't need a full SDK.
    const fakeContext: SpanContext = {
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      traceFlags: 1,
    };
    const original = trace.getActiveSpan;
    try {
      (trace as { getActiveSpan: () => unknown }).getActiveSpan = () => ({
        spanContext: () => fakeContext,
      });
      expect(traceContextMixin()).toEqual({
        trace_id: "0123456789abcdef0123456789abcdef",
        span_id: "0123456789abcdef",
      });
    } finally {
      (trace as { getActiveSpan: typeof original }).getActiveSpan = original;
    }
  });
});
