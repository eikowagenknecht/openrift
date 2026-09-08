/**
 * Adding a section here also requires mapping it in
 * `apps/api/src/middleware/admin-section-paths.ts` (`sectionAllowsRequest`)
 * and `ADMIN_SECTION_ROUTES` in `apps/web/src/lib/admin-sections.ts`; both
 * fail closed for unmapped slugs.
 */
export const ADMIN_SECTION_SLUGS = [
  "card-review",
  "card-tags",
  "custom-tags",
  "printing-desk",
  "products",
] as const;

export type AdminSectionSlug = (typeof ADMIN_SECTION_SLUGS)[number];

export const ADMIN_SECTION_LABELS: Record<AdminSectionSlug, string> = {
  "card-review": "Card Review",
  "card-tags": "Card Tags",
  "custom-tags": "Custom Tags",
  "printing-desk": "Printing Desk",
  products: "Products",
};

export function isAdminSectionSlug(value: string): value is AdminSectionSlug {
  return (ADMIN_SECTION_SLUGS as readonly string[]).includes(value);
}
