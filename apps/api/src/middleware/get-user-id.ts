import { ERROR_CODES } from "@openrift/shared";
import type { Context } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

/**
 * Returns the authenticated user's ID from a resolved session user, throwing
 * 401 when absent. The native-context counterpart of {@link getUserId} for oRPC
 * handlers (`requireUserId(context.user)`); only call from routes guarded by
 * `requireAuth`.
 * @returns The authenticated user's ID.
 */
function requireUserId(user: Variables["user"]): string {
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }
  return user.id;
}

/**
 * Extracts the authenticated user ID from a Hono context.
 * Only call from handlers guarded by `requireAuth` middleware.
 * @returns The authenticated user's ID
 */
export function getUserId(c: Context<{ Variables: Variables }>): string {
  return requireUserId(c.get("user"));
}
