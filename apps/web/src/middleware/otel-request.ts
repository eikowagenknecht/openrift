import { headersToRecord, recordSpanError } from "@openrift/shared/otel";
import { context, propagation, ROOT_CONTEXT, SpanKind, trace } from "@opentelemetry/api";
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
  name: string;
  file: string;
}

// TanStack Start identifies server functions via a base64-encoded JSON payload
// appended to `/_serverFn/`: `{ file: "/src/...", export: "<fnName>_createServerFn_handler" }`.
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

// Opens an `http.server` span per request and activates it in the OTel
// context so outbound API calls made from `next()` inherit it as their parent.
export const otelRequestMiddleware = createMiddleware().server(({ next, request }) => {
  const url = new URL(request.url);
  const parentCtx = propagation.extract(ROOT_CONTEXT, headersToRecord(request.headers));

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

  // Restored by the host nginx (CF-Connecting-IP via the realip module) and
  // forwarded as X-Real-IP; absent for internal requests (health checks, warmers).
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
      recordSpanError(span, error);
      span.end();
      throw error;
    }
  });
});
