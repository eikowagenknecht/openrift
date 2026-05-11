import { trace } from "@opentelemetry/api";
import pino from "pino";

export type Logger = pino.Logger;

/**
 * Reads the active OTel span (if any) and returns trace_id / span_id fields.
 * Used as a pino mixin so every log line carries the IDs that Alloy promotes
 * to Loki structured metadata, enabling Tempo to Loki pivots in Grafana.
 * Returns an empty object outside an active span (startup, crons) or when
 * the span context is invalid (no-op tracer without an SDK).
 * @returns Trace context fields, or an empty object when no span is active.
 */
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

/**
 * Creates a pino logger instance.
 *
 * In development, pipe output through pino-pretty for human-readable logs:
 *   `bun dev:api | bunx pino-pretty`
 *
 * In production, logs are JSON to stdout. Docker captures them; Alloy tails
 * the container and ships to Loki.
 * @returns A configured pino Logger.
 */
export function createLogger(name: string, level?: pino.LevelWithSilent): Logger {
  return pino({
    name,
    level: level ?? "info",
    mixin: traceContextMixin,
  });
}
