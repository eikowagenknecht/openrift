import type { AdminSectionSlug } from "@openrift/shared";

/** @returns Whether `path` equals `prefix` or sits underneath it (`prefix/…`). */
function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const BASE = "/api/admin/v1";

// card-review reads: the candidate list/detail pages and their pickers.
// `provider-settings` is list-only — reorder/update live under the same
// prefix but differ by method and path, so they stay closed.
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
// be readable by card-review grant holders.
const CARD_REVIEW_CARD_SLUG_DENY = new Set(["export", "provider-stats", "provider-names"]);

/**
 * Maps each grantable admin section to the API requests its admin page needs.
 * Every section in the shared `ADMIN_SECTION_SLUGS` registry must have an
 * entry here — the exhaustive `Record` type enforces that at compile time.
 *
 * card-review is the accept-only candidate review surface: candidate list and
 * detail reads plus the per-field accept flow (accept new card, accept
 * printings, accept fields, candidate-printing edits, image finishing).
 * Triage (check/ignore), manual create, delete, rename, errata, bans, upload,
 * export, and by-provider actions stay full-admin. Provider scoping (only
 * candidates from `helper_reviewable` providers) is enforced in the handlers,
 * not here — most requests identify candidates by id, so the path alone
 * cannot carry the provider.
 *
 * custom-tags additionally needs the read-only all-cards list (the tag pages'
 * card pickers) and the per-card assignment endpoints under `/cards/{id}`.
 *
 * products needs only its own prefix: the admin page's reads (product list,
 * the admin's own lists for the snapshot picker) are public / authenticated
 * endpoints outside the admin mount.
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
      return (
        detail?.groups?.slug !== undefined && !CARD_REVIEW_CARD_SLUG_DENY.has(detail.groups.slug)
      );
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
  products: (_method, path) => underPrefix(path, `${BASE}/products`),
};

/**
 * Authorization check for per-section admin grants.
 *
 * @returns Whether a grant for `section` allows the given request (HTTP
 * method plus `/api/admin/v1/…` path). Fails closed for unknown sections.
 */
export function sectionAllowsRequest(section: string, method: string, path: string): boolean {
  const matcher = (
    SECTION_PATH_MATCHERS as Record<string, (method: string, path: string) => boolean>
  )[section];
  return matcher !== undefined && matcher(method, path);
}
