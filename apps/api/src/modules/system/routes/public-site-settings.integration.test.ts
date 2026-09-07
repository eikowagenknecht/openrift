import { afterAll, describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// Requires INTEGRATION_DB_URL. Entities it creates use the STS- prefix.
const ctx = createUnauthenticatedTestContext();

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

    const json = await readJson(res);
    expect(json.settings).toBeDefined();
    expect(typeof json.settings).toBe("object");
  });

  it("contains web-scoped settings", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    const json = await readJson(res);

    expect(json.settings["STS-banner"]).toBe("Welcome to OpenRift!");
    expect(json.settings["STS-maintenance"]).toBe("false");
  });

  it("excludes non-web-scoped settings", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    const json = await readJson(res);

    expect(json.settings["STS-api-only"]).toBeUndefined();
  });

  it("sets Cache-Control with public caching", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("answers HEAD with the GET's status and headers, and no body", async () => {
    const get = await app.fetch(req("GET", "/site-settings"));
    const head = await app.fetch(req("HEAD", "/site-settings"));

    expect(head.status).toBe(200);
    expect(head.status).toBe(get.status);
    expect(head.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(head.headers.get("Content-Type")).toBe(get.headers.get("Content-Type"));
    expect(await head.text()).toBe("");
  });

  it("returns a JSON content type", async () => {
    const res = await app.fetch(req("GET", "/site-settings"));
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
