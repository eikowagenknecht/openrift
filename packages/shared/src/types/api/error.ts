import type { ErrorCode } from "../../error-codes.js";

export interface ApiErrorResponse {
  error: string;
  code: ErrorCode;
  details?: unknown;
}
