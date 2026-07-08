import type { AdminSectionSlug } from "@openrift/shared";

/**
 * Route for each grantable admin section, used to redirect partial admins to
 * a section they can access. The `satisfies` clause keeps this map exhaustive
 * as sections are added to the shared registry.
 */
export const ADMIN_SECTION_ROUTES = {
  "custom-tags": "/admin/custom-tags",
  products: "/admin/products",
} as const satisfies Record<AdminSectionSlug, `/admin/${string}`>;

/**
 * Extracts the section slug from an `/admin/...` pathname, e.g.
 * `/admin/custom-tags` → `custom-tags` and `/admin/custom-tags/x` →
 * `custom-tags`.
 *
 * @returns The first path segment after `/admin`, or null for the admin root
 * (or a non-admin path).
 */
export function adminSectionFromPathname(pathname: string): string | null {
  const match = /^\/admin\/(?<section>[^/]+)/u.exec(pathname);
  return match?.groups?.section ?? null;
}
