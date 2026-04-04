/**
 * Canonical error codes used with AppError throughout the API.
 * Always reference these constants instead of raw strings.
 */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_DECK_CODE: "INVALID_DECK_CODE",
  NOT_FOUND: "NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
