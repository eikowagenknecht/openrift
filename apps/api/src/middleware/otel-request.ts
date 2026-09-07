import { headersToRecord, recordSpanError } from "@openrift/shared/otel";
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
 * Falls back to route="<unmatched>" on a 404 so unrouted traffic stays
 * visible without exploding route cardinality.
 */
export const otelRequestMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (
  c,
  next,
) => {
  // A route containing "*" is a wildcard mount, not a real match, except
  // better-auth's, whose bounded and stable endpoint set is kept as-is.
  const matched = routePath(c, -1);
  let route: string;
  if (matched && !matched.includes("*")) {
    route = matched;
  } else if (c.req.path.startsWith("/api/auth/")) {
    route = c.req.path;
  } else {
    route = "<unmatched>";
  }

  const parentCtx = propagation.extract(ROOT_CONTEXT, headersToRecord(c.req.raw.headers));

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
      recordSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
};
