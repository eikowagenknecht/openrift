/**
 * Canonical error codes used with AppError throughout the API. This object is
 * the single source of truth for the `code` field on the wire — always
 * reference these constants instead of raw strings. `AppError.code` is typed
 * to {@link ErrorCode}, so an un-enumerated code fails to compile.
 *
 * `VALIDATION_ERROR` is for request-schema (Zod) validation failures;
 * `BAD_REQUEST` is for other malformed or illegal requests (including
 * malformed JSON). `MISSING_ALIAS` is a domain-specific data-integrity signal
 * (a matched card has no name aliases).
 */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  MISSING_ALIAS: "MISSING_ALIAS",
  NOT_FOUND: "NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  413: ERROR_CODES.PAYLOAD_TOO_LARGE,
  503: ERROR_CODES.SERVICE_UNAVAILABLE,
};

/**
 * Maps an HTTP status to the canonical {@link ErrorCode} for that status
 * family. Used to normalize framework-thrown HTTPExceptions, which carry a
 * status but no code of their own, into the standard envelope.
 * @returns The ErrorCode matching the status (INTERNAL_ERROR for any 5xx, BAD_REQUEST for other 4xx).
 */
export function codeForStatus(status: number): ErrorCode {
  return (
    STATUS_TO_CODE[status] ?? (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST)
  );
}
