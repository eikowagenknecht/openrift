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

/** Structural shape of an ApiError after it has crossed a server-function boundary. */
export interface ApiErrorShape {
  message: string;
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
