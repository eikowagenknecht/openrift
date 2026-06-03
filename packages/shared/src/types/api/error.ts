import type { ErrorCode } from "../../error-codes.js";

/** Shape of every JSON error response from the API. */
export interface ApiErrorResponse {
  error: string;
  code: ErrorCode;
  details?: unknown;
}
