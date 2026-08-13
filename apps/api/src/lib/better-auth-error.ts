import { ERROR_CODES } from "@openrift/shared";
import type { ErrorCode } from "@openrift/shared";
import type { APIError } from "better-auth/api";

import { codeForStatus } from "../errors.js";

/** The envelope fields a better-auth {@link APIError} maps onto, plus its retry hint. */
export interface MappedAuthError {
  status: number;
  code: ErrorCode;
  message: string;
  /**
   * `Retry-After` value in seconds. Present only when the failure carries the
   * api-key plugin's `details.tryAgainIn`, which is in milliseconds.
   */
  retryAfterSeconds?: number;
}

const CANONICAL_CODES = new Set<string>(Object.values(ERROR_CODES));

/**
 * Reads the api-key plugin's millisecond retry hint off an error body.
 * @returns The wait in whole seconds, or undefined when the body carries none.
 */
function retryAfterSecondsFrom(body: APIError["body"]): number | undefined {
  const details = body?.details as { tryAgainIn?: unknown } | undefined;
  const tryAgainIn = details?.tryAgainIn;
  if (typeof tryAgainIn !== "number" || !Number.isFinite(tryAgainIn) || tryAgainIn <= 0) {
    return undefined;
  }
  return Math.ceil(tryAgainIn / 1000);
}

/**
 * Normalizes a better-auth {@link APIError} into our `{ error, code }` envelope.
 *
 * better-auth throws better-call's `APIError` — a plain `Error` subclass that
 * matches none of the branches in the API's error handlers, so without this it
 * falls through to the catch-all 500. The two that reach us in practice both
 * come out of `auth.api.getSession` with an `x-api-key` header: the api-key
 * plugin's rate-limit denial (429, `RATE_LIMITED`, with a `tryAgainIn` hint) and
 * its rejection of an invalid or expired key (401).
 *
 * better-auth's `body.code` vocabulary is wider than {@link ERROR_CODES}
 * (`INVALID_API_KEY`, `KEY_NOT_FOUND`, `USAGE_EXCEEDED`, …), and the envelope's
 * `code` is the published enum that `apiErrorResponseSchema` documents. So a
 * code we don't enumerate falls back to the canonical code for the status
 * instead of leaking one the schema rejects.
 * @returns The mapped status, code, message, and retry hint.
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
