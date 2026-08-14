// Edge/browser caching policy for the public oRPC reads, derived from the
// contracts themselves so there is no second copy of the route table to keep in
// sync. A public GET opts into caching by declaring `cache` on its contract
// `.meta()` (`long` / `medium` / `short` / `sitemap` / `revalidate`), into conditional GETs
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

// oxlint-disable-next-line no-restricted-imports -- ETAG_PATHS is walked out of every contract, so the barrel is the point here; apps/api runs unbundled on Bun.
import * as contracts from "@openrift/shared/contracts";
import type { Context, Next } from "hono";

/** The cache lifetime tiers a contract can declare via `meta.cache`. */
type CacheLevel = "long" | "medium" | "short" | "sitemap" | "revalidate";

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
  /**
   * Never served from a cache, but the client keeps the body so its `etag`
   * conditional GET can come back 304. For a read that is polled continuously
   * and must never lag its source — the stream overlay's current card. `private`
   * keeps the edge out of it: a shared cache holding this even briefly would
   * put a stale card on someone's stream.
   */
  revalidate: "private, no-cache",
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
 * Hono middleware for the etag'd reads: when the request URL carries a
 * `?v=<token>` that matches the response's own ETag, the URL is
 * content-addressed — its body can never change (a content change rolls the
 * token, see `lib/catalog-version.ts` in the web app), so the edge and the
 * browser may cache it forever. Upgrades `Cache-Control` to immutable in that
 * case; a missing or stale token keeps the tier header resolved from the
 * contract meta. Registered OUTSIDE `etag()` so the ETag header exists by the
 * time it runs. Only public responses are upgraded — the viewer-varying
 * private reads never carry a version token, but stay guarded anyway.
 *
 * @param c - Hono context.
 * @param next - Next middleware in the chain.
 * @returns Resolves when downstream middleware has run and the header is set.
 */
export async function immutableWhenVersionMatches(c: Context, next: Next): Promise<void> {
  await next();
  const version = c.req.query("v");
  if (!version) {
    return;
  }
  const etagHeader = c.res.headers.get("ETag");
  const cacheControl = c.res.headers.get("Cache-Control");
  if (!etagHeader || !cacheControl?.startsWith("public")) {
    return;
  }
  const bareTag = etagHeader.replace(/^W\//u, "").replaceAll('"', "");
  if (bareTag === version) {
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
}

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
