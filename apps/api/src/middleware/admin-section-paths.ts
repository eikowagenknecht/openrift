import type { AdminSectionSlug } from "@openrift/shared/admin-sections";

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const BASE = "/api/admin/v1";

// `provider-settings` is list-only: reorder/update live under the same
// prefix but differ by method and path, so they stay closed here.
const CARD_REVIEW_GET_EXACT = new Set([
  `${BASE}/cards`,
  `${BASE}/cards/all-cards`,
  `${BASE}/cards/distinct-artists`,
  `${BASE}/provider-settings`,
  `${BASE}/markers`,
  `${BASE}/languages`,
  `${BASE}/distribution-channels`,
  `${BASE}/sets`,
]);

// GET /cards/{x} endpoints that share the card-detail path shape but must not
// be readable by a grant holder.
const CARD_DETAIL_SLUG_DENY = new Set(["export", "provider-stats", "provider-names"]);

const PRINTING_DESK_GET_EXACT = new Set([
  `${BASE}/cards/all-cards`,
  `${BASE}/cards/distinct-artists`,
  `${BASE}/distribution-channels`,
  `${BASE}/finishes`,
  `${BASE}/languages`,
  `${BASE}/markers`,
  `${BASE}/sets`,
]);

/**
 * Provider scoping (only candidates from `helper_reviewable` providers) is
 * enforced in the handlers, not here: most requests identify candidates by
 * id, so the path alone cannot carry the provider.
 */
const SECTION_PATH_MATCHERS: Record<AdminSectionSlug, (method: string, path: string) => boolean> = {
  "card-review": (method, path) => {
    if (method === "GET") {
      if (CARD_REVIEW_GET_EXACT.has(path)) {
        return true;
      }
      if (/^\/api\/admin\/v1\/cards\/new\/[^/]+$/u.test(path)) {
        return true;
      }
      const detail = /^\/api\/admin\/v1\/cards\/(?<slug>[^/]+)$/u.exec(path);
      return detail?.groups?.slug !== undefined && !CARD_DETAIL_SLUG_DENY.has(detail.groups.slug);
    }
    if (method === "POST") {
      return (
        /^\/api\/admin\/v1\/cards\/new\/[^/]+\/accept$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/[^/]+\/accept-field$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/printing\/[^/]+\/accept-field$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/[^/]+\/accept-printing$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/candidate-printings\/[^/]+\/set-image$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/printing-images\/[^/]+\/(?:activate|rotate|rehost|set-needs-trim)$/u.test(
          path,
        )
      );
    }
    if (method === "PATCH") {
      return /^\/api\/admin\/v1\/cards\/candidate-printings\/[^/]+$/u.test(path);
    }
    return false;
  },
  "card-tags": (_method, path) =>
    underPrefix(path, `${BASE}/card-tags`) || underPrefix(path, `${BASE}/tag-categories`),
  "custom-tags": (_method, path) =>
    underPrefix(path, `${BASE}/custom-tags`) ||
    underPrefix(path, `${BASE}/custom-tag-categories`) ||
    path === `${BASE}/cards/all-cards` ||
    /^\/api\/admin\/v1\/cards\/[^/]+\/custom-tags$/u.test(path),
  // Citations and printing images carry no owner in their path; per-printing
  // ownership is checked in the handler.
  "printing-desk": (method, path) => {
    if (underPrefix(path, `${BASE}/printing-desk`)) {
      return true;
    }
    if (/^\/api\/admin\/v1\/printings\/[^/]+\/citations(?:\/[^/]+)?$/u.test(path)) {
      return true;
    }
    if (method === "GET") {
      if (PRINTING_DESK_GET_EXACT.has(path)) {
        return true;
      }
      const detail = /^\/api\/admin\/v1\/cards\/(?<slug>[^/]+)$/u.exec(path);
      return detail?.groups?.slug !== undefined && !CARD_DETAIL_SLUG_DENY.has(detail.groups.slug);
    }
    if (method === "POST") {
      return (
        path === `${BASE}/markers` ||
        path === `${BASE}/distribution-channels` ||
        /^\/api\/admin\/v1\/cards\/printing\/[^/]+\/upload-image$/u.test(path) ||
        /^\/api\/admin\/v1\/cards\/printing-images\/[^/]+\/(?:activate|rotate)$/u.test(path)
      );
    }
    if (method === "DELETE") {
      return /^\/api\/admin\/v1\/cards\/printing-images\/[^/]+$/u.test(path);
    }
    return false;
  },
  products: (_method, path) => underPrefix(path, `${BASE}/products`),
};

/** Fails closed for unknown section slugs. */
export function sectionAllowsRequest(section: string, method: string, path: string): boolean {
  const matcher = (
    SECTION_PATH_MATCHERS as Record<string, (method: string, path: string) => boolean>
  )[section];
  return matcher !== undefined && matcher(method, path);
}
