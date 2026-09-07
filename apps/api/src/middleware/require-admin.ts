import type { AdminSectionSlug } from "@openrift/shared/admin-sections";
import { isAdminSectionSlug } from "@openrift/shared/admin-sections";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { MiddlewareHandler } from "hono";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Variables } from "../types.js";
import { sectionAllowsRequest } from "./admin-section-paths.js";
import { resolveSession } from "./load-session.js";

export interface AdminAccess {
  isAdmin: boolean;
  sections: AdminSectionSlug[];
}

const ADMIN_CACHE_TTL = 30_000;
const accessCache = new Map<string, { access: AdminAccess; expiresAt: number }>();

/**
 * Caches positive results (any access at all) for 30 seconds; users with no
 * access are re-checked every request.
 */
export async function getAdminAccess(repos: Repos, userId: string): Promise<AdminAccess> {
  const cached = accessCache.get(userId);
  if (cached !== undefined && Date.now() < cached.expiresAt) {
    return cached.access;
  }

  const isAdmin = await repos.admins.isAdmin(userId);
  const grantedSections = isAdmin ? [] : await repos.adminGrants.sectionsForUser(userId);
  const sections = grantedSections.filter((section) => isAdminSectionSlug(section));
  const access: AdminAccess = { isAdmin, sections };

  if (isAdmin || sections.length > 0) {
    accessCache.set(userId, { access, expiresAt: Date.now() + ADMIN_CACHE_TTL });
  } else {
    accessCache.delete(userId);
  }
  return access;
}

// Grant holders with no matching section still need to reach this probe to
// learn which sections they hold; users with no access get 403 from it too.
const ME_PATH = "/api/admin/v1/me";

export const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  await resolveSession(c);
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  const access = await getAdminAccess(c.get("repos"), user.id);
  // adminAccess is read downstream (card-review's candidate allowlist); do not remove as unused.
  c.set("adminAccess", access);
  if (!access.isAdmin) {
    const path = c.req.path;
    const method = c.req.method;
    const allowed =
      access.sections.length > 0 &&
      (path === ME_PATH ||
        access.sections.some((section) => sectionAllowsRequest(section, method, path)));
    if (!allowed) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
    }
  }

  await next();
};
