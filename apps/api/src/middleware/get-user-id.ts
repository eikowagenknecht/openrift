import type { Context } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

/**
 * Extracts the authenticated user ID from context.
 * Only call from handlers guarded by `requireAuth` middleware.
 * @returns The authenticated user's ID
 */
export function getUserId(c: Context<{ Variables: Variables }>): string {
  const user = c.get("user");
  if (!user) {
    throw new Error("getUserId called without authentication");
  }
  return user.id;
}
