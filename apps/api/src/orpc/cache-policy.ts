// Edge/browser caching policy for the public oRPC reads, derived from the
// contracts themselves so there is no second copy of the route table to keep in
// sync. A public GET opts into caching by declaring `cache` on its contract
// `.meta()` (`long` / `medium` / `short` / `sitemap`), into conditional GETs
// with `etag: true`, and into the viewer-dependent `private` variant with
// `cacheVary: "viewer"`.
//
// The `Cache-Control` value is resolved per request straight from the matched
// procedure's meta (see `cache-control-interceptor.ts`), so there is no path
// matching here at all. The only thing that needs the paths up front is the
// `etag()` Hono middleware, which is registered before oRPC runs — `ETAG_PATHS`
// is walked out of the contracts for it.
//
// (ADR-016: viewer-dependent routes run `loadSession`, which appends
// `Vary: Cookie`; hot URL-cacheable routes must not.)

import * as contracts from "@openrift/shared/contracts";

/** The cache lifetime tiers a contract can declare via `meta.cache`. */
type CacheLevel = "long" | "medium" | "short" | "sitemap";

/** Cache-relevant fields a public read declares on its contract `.meta()`. */
export interface CacheMeta {
  cache?: CacheLevel;
  cacheVary?: "viewer";
  etag?: boolean;
}

/** `Cache-Control` header value per tier (public, viewer-independent). */
const CACHE_HEADERS: Record<CacheLevel, string> = {
  /** Long-lived, fully-public catalog data (cards, sets, rules, prices, init). */
  long: "public, max-age=3600, stale-while-revalidate=86400",
  /** Sitemap data: long max-age but a shorter SWR window. */
  sitemap: "public, max-age=3600, stale-while-revalidate=7200",
  /** Promos: a few minutes, refreshed in the background. */
  medium: "public, max-age=300, stale-while-revalidate=600",
  /** Short-lived public shares + site settings. */
  short: "public, max-age=60, stale-while-revalidate=300",
};

interface ContractDef {
  route?: { method?: string; path?: string };
  meta?: CacheMeta;
}

/**
 * Walks the assembled contracts and yields every GET that opts into `etag` — the
 * same traversal `openapi-doc.ts` uses for auth meta. Only GET routes carry an
 * etag; the param segments are returned verbatim and converted to Hono form by
 * the caller.
 * @returns Each etag-enabled GET route's OpenAPI path.
 */
function collectEtagPaths(): string[] {
  const paths: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const def = (node as { "~orpc"?: ContractDef })["~orpc"];
    if (def?.route?.method && def.route.path) {
      if (def.route.method === "GET" && def.meta?.etag) {
        paths.push(def.route.path);
      }
      return;
    }
    for (const value of Object.values(node)) {
      visit(value);
    }
  };
  for (const [key, value] of Object.entries(contracts)) {
    if (key.endsWith("Contract")) {
      visit(value);
    }
  }
  return paths;
}

/**
 * Concrete request paths that get an `etag()` middleware for content-version
 * tokens + conditional GETs, in Hono's `:param` form (e.g.
 * `/api/v1/cards/:cardSlug`). Derived from the contracts that declare
 * `etag: true`.
 */
export const ETAG_PATHS: string[] = collectEtagPaths().map((path) =>
  path.replaceAll(/\{(?<param>[^}]+)\}/gu, ":$<param>"),
);

/**
 * Resolves the `Cache-Control` value for a successful public read from its
 * contract meta, or `undefined` when the procedure declares no `cache`. `hasUser`
 * selects the `private`/`public` variant for the viewer-dependent (optional-auth)
 * routes: their response body varies by viewer, and `loadSession` has already set
 * `Vary: Cookie`.
 * @returns The header value, or undefined when the procedure is uncacheable.
 */
export function resolveCacheControl(meta: CacheMeta, hasUser: boolean): string | undefined {
  if (!meta.cache) {
    return undefined;
  }
  const header = CACHE_HEADERS[meta.cache];
  return meta.cacheVary === "viewer" && hasUser ? header.replace("public,", "private,") : header;
}
