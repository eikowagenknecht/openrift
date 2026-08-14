import type { Context, Next } from "hono";
import { describe, expect, it } from "vitest";

import { cacheControlInterceptor } from "./cache-control-interceptor.js";
import type { CacheMeta } from "./cache-policy.js";
import { ETAG_PATHS, immutableWhenVersionMatches, resolveCacheControl } from "./cache-policy.js";
import type { ApiContext } from "./context.js";

const LONG = "public, max-age=3600, stale-while-revalidate=86400";
const SITEMAP = "public, max-age=3600, stale-while-revalidate=7200";
const MEDIUM = "public, max-age=300, stale-while-revalidate=600";
const SHORT_PUBLIC = "public, max-age=60, stale-while-revalidate=300";
const SHORT_PRIVATE = "private, max-age=60, stale-while-revalidate=300";

describe("resolveCacheControl", () => {
  it("maps each tier to its header", () => {
    expect(resolveCacheControl({ cache: "long" }, false)).toBe(LONG);
    expect(resolveCacheControl({ cache: "sitemap" }, false)).toBe(SITEMAP);
    expect(resolveCacheControl({ cache: "medium" }, false)).toBe(MEDIUM);
    expect(resolveCacheControl({ cache: "short" }, false)).toBe(SHORT_PUBLIC);
  });

  it("varies the viewer-dependent reads: public when anonymous, private when signed in", () => {
    const meta: CacheMeta = { cache: "short", cacheVary: "viewer" };
    expect(resolveCacheControl(meta, false)).toBe(SHORT_PUBLIC);
    expect(resolveCacheControl(meta, true)).toBe(SHORT_PRIVATE);
  });

  it("only the viewer-vary tier flips to private; a plain public read stays public", () => {
    expect(resolveCacheControl({ cache: "short" }, true)).toBe(SHORT_PUBLIC);
    expect(resolveCacheControl({ cache: "long" }, true)).toBe(LONG);
  });

  it("returns undefined when the procedure declares no cache meta", () => {
    expect(resolveCacheControl({}, false)).toBeUndefined();
    expect(resolveCacheControl({ etag: true }, true)).toBeUndefined();
  });
});

describe("immutableWhenVersionMatches", () => {
  const IMMUTABLE = "public, max-age=31536000, immutable";

  /**
   * Minimal Hono-context stand-in: a query map plus a mutable response.
   * @returns The `Cache-Control` the middleware left on the response.
   */
  function run(query: Record<string, string>, headers: Record<string, string>) {
    const res = new Response(null, { headers });
    const c = { req: { query: (key: string) => query[key] }, res } as unknown as Context;
    const next: Next = () => Promise.resolve();
    return immutableWhenVersionMatches(c, next).then(() => res.headers.get("Cache-Control"));
  }

  it("upgrades to immutable when ?v matches the bare ETag", async () => {
    await expect(run({ v: "abc123" }, { ETag: '"abc123"', "Cache-Control": LONG })).resolves.toBe(
      IMMUTABLE,
    );
  });

  it("matches weak ETags too", async () => {
    await expect(run({ v: "abc123" }, { ETag: 'W/"abc123"', "Cache-Control": LONG })).resolves.toBe(
      IMMUTABLE,
    );
  });

  it("keeps the tier header when the token is stale", async () => {
    await expect(run({ v: "older" }, { ETag: '"abc123"', "Cache-Control": LONG })).resolves.toBe(
      LONG,
    );
  });

  it("does nothing without a version token", async () => {
    await expect(run({}, { ETag: '"abc123"', "Cache-Control": LONG })).resolves.toBe(LONG);
  });

  it("never upgrades a private response", async () => {
    await expect(
      run({ v: "abc123" }, { ETag: '"abc123"', "Cache-Control": SHORT_PRIVATE }),
    ).resolves.toBe(SHORT_PRIVATE);
  });

  it("does nothing when the response carries no ETag", async () => {
    await expect(run({ v: "abc123" }, { "Cache-Control": LONG })).resolves.toBe(LONG);
  });
});

describe("ETAG_PATHS", () => {
  it("derives the etag paths from the contracts in Hono :param form", () => {
    // Parameterised reads keep their segment so Hono can match them precisely.
    expect(ETAG_PATHS).toContain("/api/v1/cards/:cardSlug");
    expect(ETAG_PATHS).toContain("/api/v1/prices/:printingId/history");
    expect(ETAG_PATHS).toContain("/api/v1/sets/:setSlug");
    // Flat reads are listed verbatim; the short-TTL shares opt out of etag.
    expect(ETAG_PATHS).toContain("/api/v1/catalog");
    expect(ETAG_PATHS).not.toContain("/api/v1/site-settings");
    expect(ETAG_PATHS).not.toContain("/api/v1/decks/share/:token");
  });
});

describe("cacheControlInterceptor", () => {
  const run = (meta: CacheMeta, hasUser: boolean) => {
    const context = { user: hasUser ? ({} as ApiContext["user"]) : null } as ApiContext;
    const next = () => Promise.resolve("output");
    const result = cacheControlInterceptor({
      context,
      procedure: { "~orpc": { meta } },
      next,
    });
    return { context, result };
  };

  it("stashes the resolved directive on the context and passes the output through", async () => {
    const { context, result } = run({ cache: "long" }, false);
    expect(context.cacheControl).toBe(LONG);
    await expect(result).resolves.toBe("output");
  });

  it("resolves the private variant from context.user for viewer-vary reads", () => {
    expect(run({ cache: "short", cacheVary: "viewer" }, true).context.cacheControl).toBe(
      SHORT_PRIVATE,
    );
    expect(run({ cache: "short", cacheVary: "viewer" }, false).context.cacheControl).toBe(
      SHORT_PUBLIC,
    );
  });

  it("leaves cacheControl undefined for an uncacheable procedure", () => {
    expect(run({}, true).context.cacheControl).toBeUndefined();
  });
});
