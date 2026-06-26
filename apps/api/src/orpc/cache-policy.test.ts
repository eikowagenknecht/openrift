import { describe, expect, it } from "vitest";

import { cacheControlFor, ETAG_PATHS } from "./cache-policy.js";

const LONG = "public, max-age=3600, stale-while-revalidate=86400";
const SITEMAP = "public, max-age=3600, stale-while-revalidate=7200";
const MEDIUM = "public, max-age=300, stale-while-revalidate=600";
const SHORT_PUBLIC = "public, max-age=60, stale-while-revalidate=300";
const SHORT_PRIVATE = "private, max-age=60, stale-while-revalidate=300";

describe("cacheControlFor", () => {
  it("returns the long catalog TTL for the fully-public reads", () => {
    for (const path of [
      "/api/v1/catalog",
      "/api/v1/prices",
      "/api/v1/prices/marketplace-info",
      "/api/v1/prices/019d6a00-1234-7000-8000-000000000001/history",
      "/api/v1/init",
      "/api/v1/landing-summary",
      "/api/v1/sets",
      "/api/v1/sets/origins",
      "/api/v1/rules",
      "/api/v1/rules/versions",
      "/api/v1/cards/some-card-slug",
    ]) {
      expect(cacheControlFor(path, false)).toBe(LONG);
    }
  });

  it("uses the dedicated sitemap and promos TTLs", () => {
    expect(cacheControlFor("/api/v1/sitemap-data", false)).toBe(SITEMAP);
    expect(cacheControlFor("/api/v1/promos", false)).toBe(MEDIUM);
  });

  it("uses the short public TTL for site settings and the share links", () => {
    for (const path of [
      "/api/v1/site-settings",
      "/api/v1/lists/share/abc123",
      "/api/v1/decks/share/abc123",
      "/api/v1/collections/share/abc123",
    ]) {
      expect(cacheControlFor(path, false)).toBe(SHORT_PUBLIC);
    }
  });

  it("varies the optional-auth reads by viewer: public when anonymous, private when signed in", () => {
    for (const path of [
      "/api/v1/feature-flags",
      "/api/v1/users/share/token-xyz",
      "/api/v1/users/share/token-xyz/lists/019d6a00-1234-7000-8000-000000000001",
    ]) {
      expect(cacheControlFor(path, false)).toBe(SHORT_PUBLIC);
      expect(cacheControlFor(path, true)).toBe(SHORT_PRIVATE);
    }
  });

  it("returns undefined for paths that should not advertise caching", () => {
    expect(cacheControlFor("/api/v1/decks", false)).toBeUndefined();
    expect(cacheControlFor("/api/v1/collections", false)).toBeUndefined();
    expect(cacheControlFor("/api/admin/v1/users", false)).toBeUndefined();
    expect(cacheControlFor("/api/v1/preferences", true)).toBeUndefined();
  });

  it("does not treat the authenticated decks/collections routes as public shares", () => {
    // Only the `/share/` sub-paths are cacheable, not the owner-scoped roots.
    expect(cacheControlFor("/api/v1/lists", true)).toBeUndefined();
    expect(cacheControlFor("/api/v1/decks/019d6a00", true)).toBeUndefined();
  });

  it("lists every parameterised cacheable read as an etag path", () => {
    expect(ETAG_PATHS).toContain("/api/v1/cards/*");
    expect(ETAG_PATHS).toContain("/api/v1/prices/*");
    expect(ETAG_PATHS).toContain("/api/v1/sets/*");
  });
});
