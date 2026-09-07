import type { ErrorCode } from "@openrift/shared/error-codes";

/**
 * Thrown by {@link fetchApi} on a non-ok response. Properties are own fields
 * (not inherited) so they survive the seroval serialization that drops the
 * prototype when a thrown error crosses a server-function boundary; check via
 * {@link isApiError}, never `instanceof`.
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

/** ApiError's shape after crossing a server-function boundary (prototype dropped). */
export interface ApiErrorShape extends Error {
  status?: number;
  code?: ErrorCode;
  details?: unknown;
  diagnostic?: string;
}

/**
 * Whether `error` is the API's 401 (expired/missing/revoked session). Matched
 * structurally on `status === 401`, not via {@link isApiError}, so it covers
 * both the raw-fetch {@link ApiError} and oRPC's `ORPCError` (`name: "Error"`).
 */
export function isSessionExpiredError(error: unknown): boolean {
  return errorStatus(error) === 401;
}

/** The HTTP status an error carries, for both {@link ApiError} and `ORPCError`. */
export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Structural (not `instanceof`) check: the prototype is lost crossing a server-function boundary. */
export function isApiError(value: unknown): value is ApiErrorShape {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ApiError" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/**
 * Builds the {@link ApiError} for a non-ok response. Parses the standard
 * `{ error, code, details }` envelope when present, falling back to
 * `errorTitle` for non-envelope bodies (HTML error pages, better-auth, a
 * network failure). Migrated oRPC endpoints surface `ORPCError` instead and
 * never pass through here.
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
    // fall through with errorTitle
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
