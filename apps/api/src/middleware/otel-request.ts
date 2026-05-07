import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

import type { Variables } from "../types.js";

const tracer = trace.getTracer("openrift-api/http");

/**
 * Hono middleware that opens an `http.server` span per request and activates
 * it as the OTel context for the `next()` chain. Child spans created during
 * request handling (notably the Kysely `db.query` spans) automatically
 * inherit it as their parent.
 *
 * Reads `routePath(c, -1)` so the most-specific matched route template is
 * used (e.g. `/api/v1/cards/:cardSlug`), not the parent wildcard. When no
 * route matched (404), the span is still emitted with route="<unmatched>"
 * so unrouted traffic remains visible without exploding cardinality.
 *
 * @returns A Hono middleware handler.
 */
export const otelRequestMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (
  c,
  next,
) => {
  // routePath(c, -1) returns the most-specific matched route. When only the
  // wildcard middleware mounts itself match (no leaf handler), the result
  // contains a `*` — treat that as unmatched so 404 traffic doesn't pollute
  // the http.route attribute with shapes like "/api/*".
  const matched = routePath(c, -1);
  const route = matched && !matched.includes("*") ? matched : "<unmatched>";
  const span = tracer.startSpan(`${c.req.method} ${route}`, {
    kind: SpanKind.SERVER,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: c.req.method,
      [ATTR_HTTP_ROUTE]: route,
      [ATTR_URL_PATH]: c.req.path,
    },
  });

  await context.with(trace.setSpan(context.active(), span), async () => {
    try {
      await next();
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);
      if (c.res.status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
};
