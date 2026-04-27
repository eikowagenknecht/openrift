import { describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

const ctx = createUnauthenticatedTestContext();

describe.skipIf(!ctx)("Landing summary route (integration)", () => {
  const { app } = ctx!;

  it("returns 200 with the lightweight payload shape", async () => {
    const res = await app.fetch(req("GET", "/landing-summary"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.cardCount).toBe("number");
    expect(typeof json.printingCount).toBe("number");
    expect(typeof json.copyCount).toBe("number");
    expect(Array.isArray(json.thumbnails)).toBe(true);
  });

  it("excludes the heavy CatalogResponse fields", async () => {
    const res = await app.fetch(req("GET", "/landing-summary"));
    const json = await res.json();
    expect("cards" in json).toBe(false);
    expect("printings" in json).toBe(false);
    expect("sets" in json).toBe(false);
  });

  it("returns thumbnails as resolved 400w webp URLs, not raw base URLs", async () => {
    const res = await app.fetch(req("GET", "/landing-summary"));
    const json = await res.json();
    if (json.thumbnails.length === 0) {
      return;
    }
    for (const url of json.thumbnails) {
      expect(url).toMatch(/-400w\.webp$/);
    }
  });

  it("returns the same Cache-Control header /catalog uses", async () => {
    const res = await app.fetch(req("GET", "/landing-summary"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("never returns more than 36 thumbnails", async () => {
    const res = await app.fetch(req("GET", "/landing-summary"));
    const json = await res.json();
    expect(json.thumbnails.length).toBeLessThanOrEqual(36);
  });
});
