import type { AdminSectionSlug } from "@openrift/shared";
import { ERROR_CODES, isAdminSectionSlug } from "@openrift/shared";
import type { MiddlewareHandler } from "hono";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Variables } from "../types.js";
import { sectionAllowsRequest } from "./admin-section-paths.js";
import { resolveSession } from "./load-session.js";

/** Resolved admin authorization for one user: full admin, or per-section grants. */
export interface AdminAccess {
  isAdmin: boolean;
  /** Granted section slugs for non-full admins; empty for full admins. */
  sections: AdminSectionSlug[];
}

const ADMIN_CACHE_TTL = 30_000; // 30 seconds
const accessCache = new Map<string, { access: AdminAccess; expiresAt: number }>();

/**
 * Resolves the user's admin access (full-admin flag plus per-section grants),
 * caching positive results — any access at all — for 30 seconds. Users with no
 * access are re-checked every request, mirroring the old isAdmin cache.
 *
 * @returns The user's {@link AdminAccess}.
 */
export async function getAdminAccess(repos: Repos, userId: string): Promise<AdminAccess> {
  const cached = accessCache.get(userId);
  if (cached !== undefined && Date.now() < cached.expiresAt) {
    return cached.access;
  }

  const isAdmin = await repos.admins.isAdmin(userId);
  const grantedSections = isAdmin ? [] : await repos.adminGrants.sectionsForUser(userId);
  // Unknown slugs in the table (e.g. a section removed from the registry)
  // are dropped here so they never authorize anything.
  const sections = grantedSections.filter((section) => isAdminSectionSlug(section));
  const access: AdminAccess = { isAdmin, sections };

  if (isAdmin || sections.length > 0) {
    accessCache.set(userId, { access, expiresAt: Date.now() + ADMIN_CACHE_TTL });
  } else {
    accessCache.delete(userId);
  }
  return access;
}

// The `me` probe stays reachable for grant holders so the web app can learn
// which sections they hold; users with no access at all still get 403 from it.
const ME_PATH = "/api/admin/v1/me";

export const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  await resolveSession(c);
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  const access = await getAdminAccess(c.get("repos"), user.id);
  // Expose the resolved access so handlers can apply finer-grained scoping
  // than the path gate (e.g. card-review's per-provider candidate allowlist).
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
