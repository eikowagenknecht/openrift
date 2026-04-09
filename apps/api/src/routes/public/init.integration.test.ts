import { afterAll, describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Init route
//
// GET /init — returns enums + keyword styles in a single response
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix INIT- for entities it creates.
// ---------------------------------------------------------------------------

const ctx = createUnauthenticatedTestContext();

// Seed keyword styles so we have data to query
if (ctx) {
  const { db } = ctx;

  await db
    .insertInto("keywordStyles")
    .values([
      { name: "INIT-Shield", color: "#4488ff", darkText: false },
      { name: "INIT-Burn", color: "#ff4400", darkText: true },
    ])
    .execute();
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("keywordStyles").where("name", "like", "INIT-%").execute();
});

describe.skipIf(!ctx)("Init route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  it("returns 200 with enums and keywordStyles", async () => {
    const res = await app.fetch(req("GET", "/init"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.enums).toBeDefined();
    expect(json.keywordStyles).toBeDefined();
  });

  it("contains enum arrays", async () => {
    const res = await app.fetch(req("GET", "/init"));
    const json = await res.json();

    expect(Array.isArray(json.enums.cardTypes)).toBe(true);
    expect(Array.isArray(json.enums.rarities)).toBe(true);
    expect(Array.isArray(json.enums.domains)).toBe(true);
  });

  it("contains seeded keyword styles", async () => {
    const res = await app.fetch(req("GET", "/init"));
    const json = await res.json();

    expect(json.keywordStyles["INIT-Shield"]).toEqual({ color: "#4488ff", darkText: false });
    expect(json.keywordStyles["INIT-Burn"]).toEqual({ color: "#ff4400", darkText: true });
  });

  it("sets Cache-Control with public caching", async () => {
    const res = await app.fetch(req("GET", "/init"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600",
    );
  });

  it("returns a JSON content type", async () => {
    const res = await app.fetch(req("GET", "/init"));
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
