import { afterAll, describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Init route
//
// GET /init — returns enums + keywords in a single response
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix INIT- for entities it creates.
// ---------------------------------------------------------------------------

const ctx = createUnauthenticatedTestContext();

if (ctx) {
  const { db } = ctx;

  await db
    .insertInto("keywords")
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
  await ctx.db.deleteFrom("keywords").where("name", "like", "INIT-%").execute();
});

describe.skipIf(!ctx)("Init route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  it("returns 200 with enums and keywords", async () => {
    const res = await app.fetch(req("GET", "/init"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.enums).toBeDefined();
    expect(json.keywords).toBeDefined();
  });

  it("contains enum arrays", async () => {
    const res = await app.fetch(req("GET", "/init"));
    const json = await res.json();

    expect(Array.isArray(json.enums.cardTypes)).toBe(true);
    expect(Array.isArray(json.enums.rarities)).toBe(true);
    expect(Array.isArray(json.enums.domains)).toBe(true);
  });

  it("contains seeded keywords", async () => {
    const res = await app.fetch(req("GET", "/init"));
    const json = await res.json();

    expect(json.keywords["INIT-Shield"]).toEqual({ color: "#4488ff", darkText: false });
    expect(json.keywords["INIT-Burn"]).toEqual({ color: "#ff4400", darkText: true });
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
