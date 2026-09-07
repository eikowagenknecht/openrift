import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { Context } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

/**
 * Called directly from oRPC handlers as `requireUserId(context.user)`; only
 * call from routes guarded by `requireAuth`.
 */
function requireUserId(user: Variables["user"]): string {
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }
  return user.id;
}

/** Only call from handlers guarded by `requireAuth` middleware. */
export function getUserId(c: Context<{ Variables: Variables }>): string {
  return requireUserId(c.get("user"));
}
