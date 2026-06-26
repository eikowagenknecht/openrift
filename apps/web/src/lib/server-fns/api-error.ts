import type { ErrorCode } from "@openrift/shared";

/**
 * Error thrown by {@link fetchApi} on a non-ok API response. Carries the
 * server-provided message (on `.message`), the `code` discriminator, optional
 * `details`, and a `diagnostic` string (method/url/status/raw body) meant for
 * the console — never the toast.
 *
 * `status`/`code`/`details`/`diagnostic` are assigned as OWN properties so they
 * survive the seroval serialization TanStack Start applies when a thrown error
 * crosses a server-function boundary. That serialization drops the prototype,
 * so consumers must duck-type via {@link isApiError}, never `instanceof`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: ErrorCode;
  readonly details?: unknown;
  readonly diagnostic: string;

  constructor(
    message: string,
    opts: { status: number; code?: ErrorCode; details?: unknown; diagnostic: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
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
  status?: number;
  code?: ErrorCode;
  details?: unknown;
  diagnostic?: string;
}

/**
 * Whether `error` is the API's 401 — the session cookie is missing, expired,
 * or revoked. This is an expected lifecycle state (sessions expire while tabs
 * stay open), not a bug: the query layer reacts by refetching the session,
 * which routes the user to /login (see `createQueryClient` and the
 * `_authenticated` layout).
 *
 * Matched structurally on `status === 401`, not via {@link isApiError}, so it
 * covers BOTH error shapes the app produces: the raw-fetch {@link ApiError}
 * (`name: "ApiError"`) and oRPC's `ORPCError` from the migrated endpoints
 * (`name: "Error"`). Both carry `status` as an own property, so it survives the
 * server-function boundary's prototype-dropping serialization.
 * @returns Whether `error` carries HTTP status 401.
 */
export function isSessionExpiredError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { status?: unknown }).status === 401
  );
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
 * Used by the raw-`fetch` callers ({@link import("./fetch-api").fetchApi} and
 * the catalog ETag fetch in `catalog-query.ts`) so they honor the exact same
 * error contract. The caller does the `throw` (`throw await
 * apiErrorFromResponse(...)`) so control flow stays visible at the call site.
 * Errors from the migrated oRPC endpoints surface as `ORPCError` instead and
 * never pass through here.
 *
 * The `res` param is typed structurally so a DOM `Response` satisfies it;
 * `request.method` is optional so a caller that doesn't carry it can label the
 * call by URL alone.
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
  return new ApiError(message, { status: res.status, code, details, diagnostic });
}
