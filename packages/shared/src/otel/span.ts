/**
 * Span helpers shared by the API's Hono middleware and the web server's
 * TanStack Start middleware. Only `@opentelemetry/api` — no SDK, so this is
 * safe anywhere.
 */

import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";

/**
 * Flatten a fetch `Headers` into the plain record `propagation.extract` wants.
 *
 * @returns The headers as a plain object, lowercase keys.
 */
export function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/** Mark a span failed and attach the thrown value as an exception event. */
export function recordSpanError(span: Span, error: unknown): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
  span.recordException(error as Error);
}
