import { ORPCError } from "@orpc/server";

import { AppError } from "../errors.js";

/**
 * Converts a thrown {@link AppError} into an {@link ORPCError} preserving its
 * status and code. Pass via `new OpenAPIHandler(router, { interceptors: [appErrorInterceptor] })`.
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
