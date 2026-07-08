import type { AdminSectionSlug } from "@openrift/shared";
import { ADMIN_SECTION_SLUGS } from "@openrift/shared";

/**
 * Route for each grantable admin section, used to redirect partial admins to
 * a section they can access and to resolve which section a pathname belongs
 * to. The `satisfies` clause keeps this map exhaustive as sections are added
 * to the shared registry.
 */
export const ADMIN_SECTION_ROUTES = {
  "card-review": "/admin/cards",
  "custom-tags": "/admin/custom-tags",
  products: "/admin/products",
} as const satisfies Record<AdminSectionSlug, `/admin/${string}`>;

/**
 * Resolves which grantable section an `/admin/...` pathname belongs to, by
 * matching against each section's route on segment boundaries (so
 * `/admin/card-types` does not match card-review's `/admin/cards`).
 *
 * card-review's manual-create pages (`.../create`) resolve to null on
 * purpose: grant holders get bounced off them by the admin layout guard
 * (the API blocks the create endpoints regardless).
 *
 * @returns The matching section slug, or null when no section claims the
 * pathname.
 */
export function adminSectionForPathname(pathname: string): AdminSectionSlug | null {
  for (const slug of ADMIN_SECTION_SLUGS) {
    const route = ADMIN_SECTION_ROUTES[slug];
    if (pathname !== route && !pathname.startsWith(`${route}/`)) {
      continue;
    }
    if (slug === "card-review" && pathname.endsWith("/create")) {
      return null;
    }
    return slug;
  }
  return null;
}
