/**
 * Registry of admin sections that can be granted individually to non-admin
 * users (via the `admin_grants` table). Full admins implicitly have every
 * section; a grant gives a regular user access to exactly one section's admin
 * page and its API surface.
 *
 * Adding a section here is not enough on its own — the API must also map the
 * slug to its endpoint requests (`sectionAllowsRequest` in
 * `apps/api/src/middleware/admin-section-paths.ts`) and the web app to its
 * route (`ADMIN_SECTION_ROUTES` in `apps/web/src/lib/admin-sections.ts`).
 * Both sides fail closed for unmapped slugs.
 */
export const ADMIN_SECTION_SLUGS = ["card-review", "card-tags", "custom-tags", "products"] as const;

export type AdminSectionSlug = (typeof ADMIN_SECTION_SLUGS)[number];

export const ADMIN_SECTION_LABELS: Record<AdminSectionSlug, string> = {
  "card-review": "Card Review",
  "card-tags": "Card Tags",
  "custom-tags": "Custom Tags",
  products: "Products",
};

/** @returns Whether the given string is a known grantable admin section slug. */
export function isAdminSectionSlug(value: string): value is AdminSectionSlug {
  return (ADMIN_SECTION_SLUGS as readonly string[]).includes(value);
}
