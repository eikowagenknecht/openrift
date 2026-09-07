// Cache-Control policy for public oRPC reads, derived from contract `.meta()`
// (`cache`, `etag`, `cacheVary`) so there is no second route table to maintain.
// The header itself is resolved per request in `cache-control-interceptor.ts`;
// `ETAG_PATHS` is walked out of the contracts up front for the `etag()` Hono
// middleware, which is registered before oRPC runs.

// oxlint-disable-next-line no-restricted-imports -- ETAG_PATHS is walked out of every contract, so the barrel is the point here; apps/api runs unbundled on Bun.
import * as contracts from "@openrift/shared/contracts";
import type { Context, Next } from "hono";

type CacheLevel = "long" | "medium" | "short" | "sitemap" | "revalidate";

export interface CacheMeta {
  cache?: CacheLevel;
  cacheVary?: "viewer";
  etag?: boolean;
}

const CACHE_HEADERS: Record<CacheLevel, string> = {
  long: "public, max-age=3600, stale-while-revalidate=86400",
  sitemap: "public, max-age=3600, stale-while-revalidate=7200",
  medium: "public, max-age=300, stale-while-revalidate=600",
  short: "public, max-age=60, stale-while-revalidate=300",
  revalidate: "private, no-cache",
};

interface ContractDef {
  route?: { method?: string; path?: string };
  meta?: CacheMeta;
}

/** GET routes with `etag: true`, in OpenAPI path form (e.g. `/cards/{cardSlug}`). */
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

/** Etag'd GET paths in Hono `:param` form, e.g. `/api/v1/cards/:cardSlug`. */
export const ETAG_PATHS: string[] = collectEtagPaths().map((path) =>
  path.replaceAll(/\{(?<param>[^}]+)\}/gu, ":$<param>"),
);

// Must run outside etag() so the ETag header exists yet.
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

/** `hasUser` selects the private/public variant; `loadSession` already set `Vary: Cookie`. */
export function resolveCacheControl(meta: CacheMeta, hasUser: boolean): string | undefined {
  if (!meta.cache) {
    return undefined;
  }
  const header = CACHE_HEADERS[meta.cache];
  return meta.cacheVary === "viewer" && hasUser ? header.replace("public,", "private,") : header;
}
