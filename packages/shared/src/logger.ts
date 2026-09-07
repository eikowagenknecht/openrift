import { trace } from "@opentelemetry/api";
import pino from "pino";

export type Logger = pino.Logger;

export function traceContextMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }
  const ctx = span.spanContext();
  if (ctx.traceId === "00000000000000000000000000000000") {
    return {};
  }
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

export function createLogger(name: string, level?: pino.LevelWithSilent): Logger {
  return pino({
    name,
    level: level ?? "info",
    mixin: traceContextMixin,
  });
}
