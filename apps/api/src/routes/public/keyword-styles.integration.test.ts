import { afterAll, describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Keyword Styles route
//
// GET /keyword-styles — returns keyword badge color/darkText map
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix KWS- for entities it creates.
// ---------------------------------------------------------------------------

const ctx = createUnauthenticatedTestContext();

// Seed keyword styles so we have data to query
if (ctx) {
  const { db } = ctx;

  await db
    .insertInto("keywordStyles")
    .values([
      { name: "KWS-Shield", color: "#4488ff", darkText: false },
      { name: "KWS-Burn", color: "#ff4400", darkText: true },
      { name: "KWS-Freeze", color: "#00ccff", darkText: false },
    ])
    .execute();
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("keywordStyles").where("name", "like", "KWS-%").execute();
});

describe.skipIf(!ctx)("Keyword Styles route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  it("returns 200 with items map", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toBeDefined();
    expect(typeof json.items).toBe("object");
  });

  it("contains seeded keyword styles with correct shape", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    const json = await res.json();

    expect(json.items["KWS-Shield"]).toEqual({ color: "#4488ff", darkText: false });
    expect(json.items["KWS-Burn"]).toEqual({ color: "#ff4400", darkText: true });
    expect(json.items["KWS-Freeze"]).toEqual({ color: "#00ccff", darkText: false });
  });

  it("returns at least the 3 seeded styles", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    const json = await res.json();

    const keys = Object.keys(json.items);
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves darkText boolean values", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    const json = await res.json();

    expect(json.items["KWS-Burn"].darkText).toBe(true);
    expect(json.items["KWS-Shield"].darkText).toBe(false);
  });

  it("sets Cache-Control with public caching", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600",
    );
  });

  it("returns a JSON content type", async () => {
    const res = await app.fetch(req("GET", "/keyword-styles"));
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
