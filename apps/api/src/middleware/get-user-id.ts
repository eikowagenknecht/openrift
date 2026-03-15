import type { Context } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

/**
 * Extracts the authenticated user ID from context.
 * Only call from handlers guarded by `requireAuth` middleware.
 * @returns The authenticated user's ID
 */
export function getUserId(c: Context<{ Variables: Variables }>): string {
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return user.id;
}
