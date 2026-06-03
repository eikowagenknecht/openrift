import type { ErrorCode } from "@openrift/shared";

/**
 * Error thrown by {@link fetchApi} on a non-ok API response. Carries the
 * server-provided message (on `.message`), the `code` discriminator, optional
 * `details`, and a `diagnostic` string (method/url/status/raw body) meant for
 * the console — never the toast.
 *
 * `code`/`details`/`diagnostic` are assigned as OWN properties so they survive
 * the seroval serialization TanStack Start applies when a thrown error crosses
 * a server-function boundary. That serialization drops the prototype, so
 * consumers must duck-type via {@link isApiError}, never `instanceof`.
 */
export class ApiError extends Error {
  readonly code?: ErrorCode;
  readonly details?: unknown;
  readonly diagnostic: string;

  constructor(message: string, opts: { code?: ErrorCode; details?: unknown; diagnostic: string }) {
    super(message);
    this.name = "ApiError";
    this.code = opts.code;
    this.details = opts.details;
    this.diagnostic = opts.diagnostic;
  }
}

/**
 * Structural shape of an ApiError after it has crossed a server-function
 * boundary (a plain object — prototype dropped — that still carries the own
 * properties). Extends Error so the {@link isApiError} guard narrows cleanly
 * from the `Error` type react-query gives its mutation `onError`.
 */
export interface ApiErrorShape extends Error {
  code?: ErrorCode;
  details?: unknown;
  diagnostic?: string;
}

/**
 * Structural (not `instanceof`) check for an {@link ApiError} — required
 * because the prototype is lost when the error round-trips a server-function
 * boundary, leaving a plain object that still carries the own properties.
 * @returns Whether `value` looks like an ApiError.
 */
export function isApiError(value: unknown): value is ApiErrorShape {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ApiError" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/**
 * Builds the {@link ApiError} to throw for a non-ok API response. Best-effort
 * parses the standard `{ error, code, details }` envelope: the server's `error`
 * message wins the user-facing toast when present, otherwise `errorTitle` is
 * the fallback (for non-envelope bodies — HTML error pages, better-auth, a
 * network failure). Logs the raw failure to the console (never the toast) and
 * records a `diagnostic` string for the console.
 *
 * Shared by {@link import("./fetch-api").fetchApi} (raw fetch) and
 * {@link import("./api-client").callApi} (Hono RPC) so both honor the exact
 * same error contract. The caller does the `throw` (`throw await
 * apiErrorFromResponse(...)`) so control flow stays visible at the call site.
 *
 * The `res` param is typed structurally so both a DOM `Response` and Hono's
 * `ClientResponse` satisfy it. `request.method` is optional because hc's
 * `ClientResponse` does not carry the request method — the URL alone labels the
 * call in that path.
 * @returns The ApiError to throw.
 */
export async function apiErrorFromResponse(
  res: { status: number; statusText: string; text: () => Promise<string> },
  errorTitle: string,
  request: { method?: string; url: string },
): Promise<ApiError> {
  const raw = await res.text().catch(() => "<no body>");
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
  const label = request.method ? `${request.method} ${request.url}` : request.url;
  const diagnostic = `${label} → ${res.status} ${res.statusText}\n${raw}`;
  console.error(`[${errorTitle}]`, {
    url: request.url,
    method: request.method,
    status: res.status,
    body: raw,
  });
  return new ApiError(message, { code, details, diagnostic });
}
