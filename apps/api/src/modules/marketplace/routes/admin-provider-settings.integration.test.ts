import { describe, expect, it } from "vitest";

import { adminReq, createTestContext } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// Uses the shared integration database (requires INTEGRATION_DB_URL) and a
// provider name prefix of "ips-" to avoid collisions with real providers.

const ADMIN_ID = "a0000000-0046-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

describe.skipIf(!adminCtx)("Admin provider-settings routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/provider-settings returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(adminReq("GET", "/provider-settings"));
      expect(res.status).toBe(403);
    });

    it("PATCH /admin/provider-settings/tcgplayer returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        adminReq("PATCH", "/provider-settings/tcgplayer", { sortOrder: 0 }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /admin/provider-settings (initial)", () => {
    it("returns 200 with a list", async () => {
      const res = await app.fetch(adminReq("GET", "/provider-settings"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.providerSettings).toBeInstanceOf(Array);
      for (const setting of json.providerSettings) {
        expect(setting.provider).toBeTypeOf("string");
        expect(setting.sortOrder).toBeTypeOf("number");
        expect(setting.isHidden).toBeTypeOf("boolean");
      }
    });
  });

  describe("PATCH /admin/provider-settings/:provider", () => {
    it("upserts a new provider setting (ips-test-provider)", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/provider-settings/ips-test-provider", {
          sortOrder: 50,
          isHidden: true,
        }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(adminReq("GET", "/provider-settings"));
      const json = await readJson(listRes);
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry).toBeDefined();
      expect(ipsEntry.sortOrder).toBe(50);
      expect(ipsEntry.isHidden).toBe(true);
    });

    it("updates sortOrder only", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/provider-settings/ips-test-provider", { sortOrder: 10 }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(adminReq("GET", "/provider-settings"));
      const json = await readJson(listRes);
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry.sortOrder).toBe(10);
    });

    it("updates isHidden only", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/provider-settings/ips-test-provider", { isHidden: false }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(adminReq("GET", "/provider-settings"));
      const json = await readJson(listRes);
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry.isHidden).toBe(false);
    });

    it("upserts a second test provider", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/provider-settings/ips-test-provider-2", {
          sortOrder: 60,
          isHidden: false,
        }),
      );
      expect(res.status).toBe(204);
    });
  });

  describe("PUT /admin/provider-settings/reorder", () => {
    it("reorders providers", async () => {
      const res = await app.fetch(
        adminReq("PUT", "/provider-settings/reorder", {
          providers: ["ips-test-provider-2", "ips-test-provider"],
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 400 for duplicate providers", async () => {
      const res = await app.fetch(
        adminReq("PUT", "/provider-settings/reorder", {
          providers: ["ips-test-provider", "ips-test-provider"],
        }),
      );
      expect(res.status).toBe(400);

      const json = await readJson(res);
      expect(json.message).toContain("Duplicate");
    });
  });

  describe("cleanup", () => {
    it("removes ips- test provider settings", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const { db } = adminCtx!;
      await db.deleteFrom("providerSettings").where("provider", "like", "ips-%").execute();

      const res = await app.fetch(adminReq("GET", "/provider-settings"));
      const json = await readJson(res);
      const ipsEntries = json.providerSettings.filter((s: { provider: string }) =>
        s.provider.startsWith("ips-"),
      );
      expect(ipsEntries).toHaveLength(0);
    });
  });
});
