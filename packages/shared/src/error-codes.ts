/**
 * Canonical error codes carried on the `code` field of every API error
 * response (the `{ error, code, details }` envelope). This is the single
 * source of truth shared by the API (which throws them via `AppError`) and the
 * web app (which reads them off the envelope). Always reference these constants
 * instead of raw strings; `ErrorCode` narrows so an un-enumerated code fails to
 * compile.
 *
 * `VALIDATION_ERROR` is for request-schema (Zod) validation failures;
 * `BAD_REQUEST` is for other malformed or illegal requests (including malformed
 * JSON). `MISSING_ALIAS` is a domain-specific data-integrity signal (a matched
 * card has no name aliases). `RATE_LIMITED` is the 429 code, and is spelled the
 * same as better-auth's own code for an API-key rate-limit denial so that
 * denial maps onto the envelope unchanged.
 */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  MISSING_ALIAS: "MISSING_ALIAS",
  NOT_FOUND: "NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
