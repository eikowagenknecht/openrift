// Error-normalization helpers shared by the named offline mutation functions
// (ADR-027 step 3) in copies-collection.ts and collections-offline.ts. They
// decide how a failed API call settles in the outbox: permanent refusals roll
// the optimistic state back, everything else keeps retrying.

import { ORPCError } from "@orpc/client";
import { NonRetriableError } from "@tanstack/offline-transactions";

import { isApiError } from "@/lib/server-fns/api-error";

/**
 * The HTTP status of a failed API call, or `undefined` for a non-HTTP error
 * (a network failure, an abort). The browser sync path calls oRPC directly, so
 * a non-2xx surfaces as an `ORPCError` carrying the original status; the
 * server-function path still produces an `ApiError`.
 * @returns The numeric HTTP status, or `undefined`.
 */
function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof ORPCError) {
    return error.status;
  }
  if (isApiError(error)) {
    return error.status;
  }
  return undefined;
}

/**
 * Normalizes a genuine network failure (offline/DNS/CORS, which fetch throws
 * as a TypeError) into a message the toast can show. An abort throws a
 * DOMException("AbortError"), which is NOT a TypeError and so propagates
 * untouched to withTimeout. A non-2xx becomes an `ORPCError` carrying the
 * server's message, also propagated.
 *
 * @returns Never — always throws.
 */
export function rethrowAsNetworkError(error: unknown): never {
  if (error instanceof TypeError) {
    // oxlint-disable-next-line unicorn/prefer-type-error -- this is a network failure, not a type check
    throw new Error("Can't reach the server — check your connection");
  }
  throw error;
}

/**
 * A permanent request failure: the server understood and refused (4xx), so
 * retrying yields the same answer. Network failures and 5xx stay retriable.
 *
 * @returns A `NonRetriableError` for 4xx responses, the original error otherwise.
 */
export function asNonRetriableIfPermanent(error: unknown): unknown {
  const status = httpStatusOf(error);
  if (status !== undefined && status >= 400 && status < 500) {
    const message = error instanceof Error ? error.message : "Request failed";
    return new NonRetriableError(message);
  }
  return error;
}
