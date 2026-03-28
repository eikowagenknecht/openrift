import { afterAll, describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Site Settings route
//
// GET /site-settings — returns web-scoped settings as a key-value map
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix STS- for entities it creates.
// ---------------------------------------------------------------------------

const ctx = createUnauthenticatedTestContext();

// Seed site settings so we have data to query
if (ctx) {
  const { db } = ctx;

  await db
    .insertInto("siteSettings")
    .values([
      { key: "STS-banner", value: "Welcome to OpenRift!", scope: "web" },
      { key: "STS-maintenance", value: "false", scope: "web" },
      { key: "STS-api-only", value: "hidden", scope: "api" },
    ])
    .execute();
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("siteSettings").where("key", "like", "STS-%").execute();
});

describe.skipIf(!ctx)("Site Settings route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  it("returns 200 with items map", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toBeDefined();
    expect(typeof json.items).toBe("object");
  });

  it("contains web-scoped settings", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    const json = await res.json();

    expect(json.items["STS-banner"]).toBe("Welcome to OpenRift!");
    expect(json.items["STS-maintenance"]).toBe("false");
  });

  it("excludes non-web-scoped settings", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    const json = await res.json();

    expect(json.items["STS-api-only"]).toBeUndefined();
  });

  it("sets Cache-Control with public caching", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("returns a JSON content type", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
