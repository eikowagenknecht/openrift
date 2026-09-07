import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { ErrorCode } from "@openrift/shared/error-codes";
import type { APIError } from "better-auth/api";

import { codeForStatus } from "../errors.js";

/** The envelope fields a better-auth {@link APIError} maps onto, plus its retry hint. */
export interface MappedAuthError {
  status: number;
  code: ErrorCode;
  message: string;
  /** Seconds. Present only when the failure carries the api-key plugin's `tryAgainIn` (ms). */
  retryAfterSeconds?: number;
}

const CANONICAL_CODES = new Set<string>(Object.values(ERROR_CODES));

/** Reads the api-key plugin's millisecond retry hint off an error body. */
function retryAfterSecondsFrom(body: APIError["body"]): number | undefined {
  const details = body?.details as { tryAgainIn?: unknown } | undefined;
  const tryAgainIn = details?.tryAgainIn;
  if (typeof tryAgainIn !== "number" || !Number.isFinite(tryAgainIn) || tryAgainIn <= 0) {
    return undefined;
  }
  return Math.ceil(tryAgainIn / 1000);
}

/**
 * better-auth's `APIError` matches none of the API's error-handler branches and
 * would otherwise fall through to a 500; its `body.code` vocabulary is also
 * wider than {@link ERROR_CODES}, so an unenumerated code falls back to `codeForStatus`.
 */
export function mapAuthError(err: APIError): MappedAuthError {
  const status = err.statusCode;
  const bodyCode = err.body?.code;
  return {
    status,
    code:
      bodyCode !== undefined && CANONICAL_CODES.has(bodyCode)
        ? (bodyCode as ErrorCode)
        : codeForStatus(status),
    // better-call sets `message` from `body.message`, so the fallback only
    // matters for a body-less throw.
    message: err.body?.message ?? err.message,
    retryAfterSeconds: retryAfterSecondsFrom(err.body),
  };
}
