import type { ErrorCode } from "@openrift/shared";
import { context, propagation } from "@opentelemetry/api";

import { ApiError } from "./api-error";
import { API_URL } from "./api-url";

interface FetchApiOptions {
  // Full, user-facing sentence for the Sonner toast on failure (e.g. "Couldn't delete collection").
  errorTitle: string;
  cookie?: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  // Status codes that should be returned to the caller without logging or
  // throwing — for endpoints that use non-2xx codes as intentional control
  // flow (e.g. /admin/me returning 401/403 for non-admins). The Response is
  // returned as-is; callers must inspect res.ok / res.status themselves.
  acceptStatuses?: readonly number[];
}

/**
 * Fetches the API with structured error reporting. On a non-2xx response
 * (that isn't listed in acceptStatuses), it parses the standard
 * `{ error, code, details }` envelope and throws an {@link ApiError} carrying
 * the server's `error` message (so it can reach the user-facing toast), the
 * `code`, and a `diagnostic` (method/url/status/body) for the console. Parsing
 * is best-effort: a non-envelope body (HTML, better-auth, network error) falls
 * back to `errorTitle` as the message. The ok / acceptStatuses path returns the
 * Response untouched, before any parsing.
 * @returns The Response for ok or accepted statuses; throws ApiError otherwise.
 */
export async function fetchApi(options: FetchApiOptions): Promise<Response> {
  const {
    errorTitle,
    cookie,
    path,
    method = "GET",
    body,
    headers: extraHeaders,
    acceptStatuses,
  } = options;
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  // Inject W3C traceparent so the API can continue the trace started by the
  // web server-side middleware. No-op when no span is active (OTel SDK not
  // started, or this call is outside a request context).
  propagation.inject(context.active(), headers);
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !acceptStatuses?.includes(res.status)) {
    const raw = await res.text().catch(() => "<no body>");
    // Best-effort parse of the { error, code, details } envelope; the server's
    // message wins the toast when present, else fall back to errorTitle.
    let message = errorTitle;
    let code: ErrorCode | undefined;
    let details: unknown;
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; code?: unknown; details?: unknown };
      if (typeof parsed.error === "string") {
        message = parsed.error;
        code = typeof parsed.code === "string" ? (parsed.code as ErrorCode) : undefined;
        details = parsed.details;
      }
    } catch {
      // Non-JSON body (HTML error page, better-auth, network failure) — keep errorTitle.
    }
    const diagnostic = `${method} ${url} → ${res.status} ${res.statusText}\n${raw}`;
    console.error(`[${errorTitle}]`, { url, method, status: res.status, body: raw });
    throw new ApiError(message, { code, details, diagnostic });
  }
  return res;
}

/**
 * Same as fetchApi, but parses the response as JSON and returns the typed payload.
 * @returns The decoded JSON body as T.
 */
export async function fetchApiJson<T>(options: FetchApiOptions): Promise<T> {
  const res = await fetchApi(options);
  return res.json() as Promise<T>;
}
