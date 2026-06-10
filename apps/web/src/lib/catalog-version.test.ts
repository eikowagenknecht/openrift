import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeSeededCatalogVersion,
  seedCatalogVersion,
  versionFromEtag,
} from "./catalog-version";

describe("seedCatalogVersion / consumeSeededCatalogVersion", () => {
  beforeEach(() => {
    // Drain module-level state so tests stay order-independent.
    consumeSeededCatalogVersion();
  });

  it("returns null when nothing was seeded", () => {
    expect(consumeSeededCatalogVersion()).toBeNull();
  });

  it("returns the seeded token", () => {
    seedCatalogVersion("abc123");
    expect(consumeSeededCatalogVersion()).toBe("abc123");
  });

  it("consumes the seed — a second read returns null", () => {
    seedCatalogVersion("abc123");
    consumeSeededCatalogVersion();
    expect(consumeSeededCatalogVersion()).toBeNull();
  });

  it("ignores a null seed and keeps the previous token", () => {
    seedCatalogVersion("abc123");
    seedCatalogVersion(null);
    expect(consumeSeededCatalogVersion()).toBe("abc123");
  });

  it("overwrites an unconsumed token with a newer one", () => {
    seedCatalogVersion("old");
    seedCatalogVersion("new");
    expect(consumeSeededCatalogVersion()).toBe("new");
  });
});

describe("versionFromEtag", () => {
  it("strips surrounding quotes from a strong ETag", () => {
    expect(versionFromEtag('"abc123"')).toBe("abc123");
  });

  it("strips the weak prefix and quotes", () => {
    expect(versionFromEtag('W/"abc123"')).toBe("abc123");
  });

  it("passes through an unquoted value", () => {
    expect(versionFromEtag("abc123")).toBe("abc123");
  });

  it("returns null for a missing header", () => {
    expect(versionFromEtag(null)).toBeNull();
  });

  it("returns null for an empty or quotes-only header", () => {
    expect(versionFromEtag("")).toBeNull();
    expect(versionFromEtag('""')).toBeNull();
  });
});
