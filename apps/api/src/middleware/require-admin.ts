import type { MiddlewareHandler } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

const ADMIN_CACHE_TTL = 30_000; // 30 seconds
const adminCache = new Map<string, number>(); // userId → expiresAt timestamp

export async function isAdmin(userId: string): Promise<boolean> {
  const expiresAt = adminCache.get(userId);
  if (expiresAt !== undefined && Date.now() < expiresAt) {
    return true;
  }

  const row = await db
    .selectFrom("admins")
    .select("user_id")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (row) {
    adminCache.set(userId, Date.now() + ADMIN_CACHE_TTL);
    return true;
  }

  adminCache.delete(userId);
  return false;
}

export const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!(await isAdmin(user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
