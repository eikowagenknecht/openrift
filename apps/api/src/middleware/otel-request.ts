import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
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
 */
export const otelRequestMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (
  c,
  next,
) => {
  // routePath(c, -1) returns the most-specific matched route. When only the
  // wildcard middleware mounts itself match (no leaf handler), the result
  // contains a `*` — treat that as unmatched so 404 traffic doesn't pollute
  // the http.route attribute with shapes like "/api/*".
  //
  // Exception: better-auth mounts as a single `/api/auth/*` wildcard
  // handler but its endpoint set is bounded and stable (~20 paths). Use
  // the raw path under `/api/auth/` so each better-auth endpoint shows up
  // separately in metrics and traces.
  const matched = routePath(c, -1);
  let route: string;
  if (matched && !matched.includes("*")) {
    route = matched;
  } else if (c.req.path.startsWith("/api/auth/")) {
    route = c.req.path;
  } else {
    route = "<unmatched>";
  }

  // Extract any incoming W3C traceparent so the span links to the upstream
  // trace (e.g. the web SSR span that issued this request). Falls back to
  // ROOT_CONTEXT (a fresh trace) when no header is present.
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const parentCtx = propagation.extract(ROOT_CONTEXT, headers);

  const span = tracer.startSpan(
    `${c.req.method} ${route}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        [ATTR_HTTP_REQUEST_METHOD]: c.req.method,
        [ATTR_HTTP_ROUTE]: route,
        [ATTR_URL_PATH]: c.req.path,
      },
    },
    parentCtx,
  );

  await context.with(trace.setSpan(parentCtx, span), async () => {
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
