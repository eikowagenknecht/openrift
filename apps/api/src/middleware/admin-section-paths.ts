import type { AdminSectionSlug } from "@openrift/shared";

/** @returns Whether `path` equals `prefix` or sits underneath it (`prefix/…`). */
function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const BASE = "/api/admin/v1";

/**
 * Maps each grantable admin section to the API paths its admin page needs.
 * Every section in the shared `ADMIN_SECTION_SLUGS` registry must have an
 * entry here — the exhaustive `Record` type enforces that at compile time.
 *
 * custom-tags additionally needs the read-only all-cards list (the tag pages'
 * card pickers) and the per-card assignment endpoints under `/cards/{id}`.
 */
const SECTION_PATH_MATCHERS: Record<AdminSectionSlug, (path: string) => boolean> = {
  "custom-tags": (path) =>
    underPrefix(path, `${BASE}/custom-tags`) ||
    underPrefix(path, `${BASE}/custom-tag-categories`) ||
    path === `${BASE}/cards/all-cards` ||
    /^\/api\/admin\/v1\/cards\/[^/]+\/custom-tags$/u.test(path),
};

/**
 * Authorization check for per-section admin grants.
 *
 * @returns Whether a grant for `section` allows requests to the given
 * `/api/admin/v1/…` path. Fails closed for unknown sections.
 */
export function sectionAllowsPath(section: string, path: string): boolean {
  const matcher = (SECTION_PATH_MATCHERS as Record<string, (path: string) => boolean>)[section];
  return matcher !== undefined && matcher(path);
}
