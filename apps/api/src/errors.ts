// ERROR_CODES + ErrorCode are the single source of truth for the `{ error,
// code }` envelope — shared by the API and the web app — so they live in
// @openrift/shared. Import them from there directly (not via this module);
// errors.ts owns only the server-side AppError + codeForStatus.
import { ERROR_CODES } from "@openrift/shared";
import type { ErrorCode } from "@openrift/shared";

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
  429: ERROR_CODES.RATE_LIMITED,
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
