// Client-side carrier for the catalog version token (the catalog response's
// ETag, computed by the API's hono/etag middleware). The browser appends it as
// `?v=` when fetching `/api/v1/catalog` from the Cloudflare edge, so a catalog
// content change rolls the cache key and the edge can never serve a stale body
// for a fresh token — closing the "SSR shows the new card, hydrated grid
// doesn't" gap (max-age=3600 + stale-while-revalidate would otherwise keep
// serving the old catalog for up to a day after an admin edit).
//
// The seed is consume-once on purpose: the /cards SSR loader ships a fresh
// token in its payload (saving a round trip on the LCP-critical first load),
// but any later refetch should resolve the current token from the server
// instead of reusing a value from a possibly old page load.

let seededVersion: string | null = null;

/**
 * Stores a version token delivered out-of-band (the /cards SSR loader
 * payload) for the next catalog fetch to consume. Idempotent and safe to call
 * during render.
 * @param version The catalog version token, or null when none is known.
 */
export function seedCatalogVersion(version: string | null): void {
  if (version !== null) {
    seededVersion = version;
  }
}

/**
 * Returns the seeded version token and clears it, so each seed is used for at
 * most one fetch.
 * @returns The seeded token, or null when nothing was seeded.
 */
export function consumeSeededCatalogVersion(): string | null {
  const version = seededVersion;
  seededVersion = null;
  return version;
}

/**
 * Extracts a URL-safe version token from an `ETag` response header by
 * stripping the weak prefix and surrounding quotes (`W/"abc"` → `abc`). The
 * token is opaque — only its stability per response body matters.
 * @returns The bare token, or null for a missing/empty header.
 */
export function versionFromEtag(etagHeader: string | null): string | null {
  if (etagHeader === null) {
    return null;
  }
  const version = etagHeader.replace(/^W\//u, "").replaceAll('"', "");
  return version === "" ? null : version;
}
