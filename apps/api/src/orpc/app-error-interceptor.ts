import { ORPCError } from "@orpc/server";

import { AppError } from "../errors.js";

/**
 * Global oRPC interceptor that converts a thrown {@link AppError} into an
 * {@link ORPCError} preserving its status + code. Pass to a handler via
 * `new OpenAPIHandler(router, { interceptors: [appErrorInterceptor] })`.
 *
 * This is the idiomatic replacement for the old per-handler `bridgeAppErrors`
 * wrapper: handlers (and the services they call) throw `AppError` for
 * domain/state failures (404/409/422), and this single boundary maps them to
 * the typed oRPC error response. Non-`AppError` throws pass through unchanged
 * (oRPC maps them to `INTERNAL_SERVER_ERROR`).
 *
 * Generic over the handler result so it is assignable to any oRPC handler's
 * `interceptors` option (it only reads `next`, ignoring the rest of the
 * interceptor options).
 * @returns The downstream handler result.
 */
export async function appErrorInterceptor<T>(options: { next: () => Promise<T> }): Promise<T> {
  try {
    return await options.next();
  } catch (error) {
    if (error instanceof AppError) {
      throw new ORPCError(error.code, { status: error.status, message: error.message });
    }
    throw error;
  }
}
