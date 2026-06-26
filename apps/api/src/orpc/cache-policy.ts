// Edge/browser caching policy for the public oRPC reads, centralised so the
// single catch-all mount (app.ts) can apply it without per-route mounts. Keep
// this in sync with the contracts: a public GET that should be cacheable needs
// an entry here, and one whose response varies by viewer also needs `etag()`
// only if conditional GETs are wanted. (ADR-016: viewer-dependent routes run
// `loadSession`, which appends `Vary: Cookie`; hot URL-cacheable routes must
// not.)

/** Long-lived, fully-public catalog data (cards, sets, rules, prices, init). */
const LONG = "public, max-age=3600, stale-while-revalidate=86400";
/** Sitemap data: long max-age but a shorter SWR window. */
const SITEMAP = "public, max-age=3600, stale-while-revalidate=7200";
/** Promos: a few minutes, refreshed in the background. */
const MEDIUM = "public, max-age=300, stale-while-revalidate=600";
/** Short-lived public shares + site settings. */
const SHORT_PUBLIC = "public, max-age=60, stale-while-revalidate=300";
/** Same TTL, but private when a viewer is attached (optional-auth routes). */
const SHORT_PRIVATE = "private, max-age=60, stale-while-revalidate=300";

/**
 * Concrete request paths (after Hono's pattern match) that get an `etag()`
 * middleware for content-version tokens + conditional GETs. Wildcards cover the
 * parameterised routes (`/api/v1/cards/:cardSlug`, `/api/v1/prices/...`, etc.).
 */
export const ETAG_PATHS = [
  "/api/v1/catalog",
  "/api/v1/prices",
  "/api/v1/prices/*",
  "/api/v1/promos",
  "/api/v1/cards/*",
  "/api/v1/landing-summary",
  "/api/v1/sets",
  "/api/v1/sets/*",
  "/api/v1/rules",
  "/api/v1/rules/versions",
  "/api/v1/init",
  "/api/v1/sitemap-data",
] as const;

/**
 * Resolves the `Cache-Control` value for a successful public read, or
 * `undefined` when the path should not advertise caching. `hasUser` selects the
 * `private`/`public` variant for the two optional-auth routes.
 * @returns The header value, or undefined when the path is uncacheable.
 */
export function cacheControlFor(path: string, hasUser: boolean): string | undefined {
  // Optional-auth reads: the response body varies by viewer, so a signed-in
  // request is `private`. `loadSession` has already set `Vary: Cookie`.
  if (path === "/api/v1/feature-flags" || path.startsWith("/api/v1/users/share/")) {
    return hasUser ? SHORT_PRIVATE : SHORT_PUBLIC;
  }

  if (
    path === "/api/v1/catalog" ||
    path === "/api/v1/prices" ||
    path.startsWith("/api/v1/prices/") ||
    path === "/api/v1/init" ||
    path === "/api/v1/landing-summary" ||
    path === "/api/v1/sets" ||
    path.startsWith("/api/v1/sets/") ||
    path === "/api/v1/rules" ||
    path === "/api/v1/rules/versions" ||
    path.startsWith("/api/v1/cards/")
  ) {
    return LONG;
  }

  if (path === "/api/v1/sitemap-data") {
    return SITEMAP;
  }

  if (path === "/api/v1/promos") {
    return MEDIUM;
  }

  if (
    path === "/api/v1/site-settings" ||
    path.startsWith("/api/v1/lists/share/") ||
    path.startsWith("/api/v1/decks/share/") ||
    path.startsWith("/api/v1/collections/share/")
  ) {
    return SHORT_PUBLIC;
  }

  return undefined;
}
