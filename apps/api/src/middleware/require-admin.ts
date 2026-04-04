import type { MiddlewareHandler } from "hono";

import type { Repos } from "../deps.js";
import { AppError, ERROR_CODES } from "../errors.js";
import type { Variables } from "../types.js";

const ADMIN_CACHE_TTL = 30_000; // 30 seconds
const adminCache = new Map<string, number>(); // userId → expiresAt timestamp

async function isAdmin(repos: Repos, userId: string): Promise<boolean> {
  const expiresAt = adminCache.get(userId);
  if (expiresAt !== undefined && Date.now() < expiresAt) {
    return true;
  }

  const found = await repos.admins.isAdmin(userId);

  if (found) {
    adminCache.set(userId, Date.now() + ADMIN_CACHE_TTL);
    return true;
  }

  adminCache.delete(userId);
  return false;
}

export const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  if (!(await isAdmin(c.get("repos"), user.id))) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
  }

  await next();
};
