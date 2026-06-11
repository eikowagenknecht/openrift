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
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";
import { createMiddleware } from "@tanstack/react-start";

import { contextWithClientIp } from "@/lib/server-fns/client-ip-context";

const tracer = trace.getTracer("openrift-web/http");

const SERVER_FN_PREFIX = "/_serverFn/";

interface ServerFnIdentity {
  /** The exported function name (without the `_createServerFn_handler` suffix). */
  name: string;
  /** The source file path. */
  file: string;
}

/**
 * TanStack Start identifies server functions via a base64-encoded JSON
 * payload appended to `/_serverFn/`, e.g.
 * `/_serverFn/eyJmaWxlIjoiL3NyYy8uLi4ifQ`. The encoded payload is
 * `{ file: "/src/...", export: "<fnName>_createServerFn_handler" }`.
 *
 * Decoding it makes traces readable (`serverFn:fetchPriceHistory` instead
 * of an opaque blob) and keeps the route label cardinality bounded.
 *
 * @param path - The request path, e.g. `/_serverFn/<base64>`.
 * @returns The decoded function identity, or `undefined` if the path
 * isn't a server-function call or the payload can't be decoded.
 */
const decodeServerFn = (path: string): ServerFnIdentity | undefined => {
  if (!path.startsWith(SERVER_FN_PREFIX)) {
    return undefined;
  }
  const encoded = path.slice(SERVER_FN_PREFIX.length);
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      typeof (decoded as { export?: unknown }).export !== "string"
    ) {
      return undefined;
    }
    const exportName = (decoded as { export: string }).export;
    const fileName = (decoded as { file?: string }).file ?? "";
    const name = exportName.replace(/_createServerFn_handler$/u, "");
    const file = fileName.split("?")[0] ?? "";
    return { name, file };
  } catch {
    return undefined;
  }
};

/**
 * TanStack Start request middleware that opens an `http.server` span per
 * SSR / server-route / server-function request and activates it in the
 * OTel context for the duration of `next()`. Outbound API calls made from
 * `next()` (via `fetchApi`) inherit this span as their parent and inject
 * the W3C `traceparent` header, so the API's own span links back here and
 * the trace shows the full web → api → db chain.
 *
 * Extracts any incoming `traceparent` from the request headers — usually
 * absent for browser-initiated requests, but harmless when present (e.g.
 * an upstream proxy / load balancer that already started a trace).
 */
export const otelRequestMiddleware = createMiddleware().server(({ next, request }) => {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const parentCtx = propagation.extract(ROOT_CONTEXT, headers);

  // Server-function calls (`/_serverFn/<base64>`) get a readable span
  // name + a normalized `http.route` so they don't show up as opaque
  // blobs in traces and don't blow up route cardinality in metrics.
  const serverFn = decodeServerFn(url.pathname);
  const spanName = serverFn ? `serverFn:${serverFn.name}` : `${request.method} ${url.pathname}`;
  const route = serverFn ? `${SERVER_FN_PREFIX}${serverFn.name}` : url.pathname;

  const attributes: Record<string, string> = {
    [ATTR_HTTP_REQUEST_METHOD]: request.method,
    [ATTR_URL_PATH]: url.pathname,
    [ATTR_HTTP_ROUTE]: route,
  };
  if (serverFn) {
    attributes["serverfn.name"] = serverFn.name;
    if (serverFn.file) {
      attributes["serverfn.file"] = serverFn.file;
    }
  }

  // The real visitor IP, restored by the host nginx (CF-Connecting-IP via the
  // realip module) and forwarded as X-Real-IP. Stashed on the OTel context so
  // outbound API calls (fetchApi / serverApiClient) forward it to the API,
  // whose logs and rate limiters key on it. Absent for internal requests
  // (health checks hit the container directly, cache warmers have no request).
  const clientIp = request.headers.get("x-real-ip") ?? "";
  if (clientIp !== "") {
    attributes["client.address"] = clientIp;
  }

  const span = tracer.startSpan(
    spanName,
    {
      kind: SpanKind.SERVER,
      attributes,
    },
    parentCtx,
  );

  let activeCtx = trace.setSpan(parentCtx, span);
  if (clientIp !== "") {
    activeCtx = contextWithClientIp(activeCtx, clientIp);
  }

  return context.with(activeCtx, async () => {
    try {
      const result = await next();
      span.end();
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  });
});
