import type { Database } from "@openrift/shared/db";
import type { MiddlewareHandler } from "hono";
import type { Kysely } from "kysely";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

const ADMIN_CACHE_TTL = 30_000; // 30 seconds
const adminCache = new Map<string, number>(); // userId → expiresAt timestamp

export async function isAdmin(db: Kysely<Database>, userId: string): Promise<boolean> {
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
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }

  if (!(await isAdmin(c.get("db"), user.id))) {
    throw new AppError(403, "FORBIDDEN", "Forbidden");
  }

  await next();
};
