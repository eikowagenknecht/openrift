import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin marketplace-groups routes (unified)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses group_id range 10100-10199 to avoid collisions.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0012-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Admin marketplace-groups routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── Seed marketplace groups for this test file ──────────────────────────

  describe("GET /admin/marketplace-groups (after seeding)", () => {
    it("returns both tcgplayer and cardmarket groups", async () => {
      await db
        .insertInto("marketplaceGroups")
        .values([
          {
            marketplace: "tcgplayer",
            groupId: 10_100,
            name: "MKG Alpha Set",
            abbreviation: "MAS",
          },
          {
            marketplace: "cardmarket",
            groupId: 10_101,
            name: "MKG Beta Set",
            abbreviation: null,
          },
        ])
        .execute();

      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toEqual(expect.any(Array));

      const cardmarketGroup = json.groups.find(
        (g: { marketplace: string; groupId: number }) =>
          g.marketplace === "cardmarket" && g.groupId === 10_101,
      );
      const tcgplayerGroup = json.groups.find(
        (g: { marketplace: string; groupId: number }) =>
          g.marketplace === "tcgplayer" && g.groupId === 10_100,
      );

      expect(cardmarketGroup).toBeDefined();
      expect(cardmarketGroup.marketplace).toBe("cardmarket");
      expect(cardmarketGroup.groupId).toBe(10_101);
      expect(cardmarketGroup.name).toBe("MKG Beta Set");
      expect(cardmarketGroup.abbreviation).toBeNull();
      expect(cardmarketGroup.stagedCount).toBe(0);
      expect(cardmarketGroup.assignedCount).toBe(0);

      expect(tcgplayerGroup).toBeDefined();
      expect(tcgplayerGroup.marketplace).toBe("tcgplayer");
      expect(tcgplayerGroup.groupId).toBe(10_100);
      expect(tcgplayerGroup.name).toBe("MKG Alpha Set");
      expect(tcgplayerGroup.abbreviation).toBe("MAS");
      expect(tcgplayerGroup.stagedCount).toBe(0);
      expect(tcgplayerGroup.assignedCount).toBe(0);
    });

    it("response shape includes all expected fields", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      const json = await res.json();

      for (const group of json.groups) {
        expect(group).toHaveProperty("marketplace");
        expect(group).toHaveProperty("groupId");
        expect(group).toHaveProperty("name");
        expect(group).toHaveProperty("abbreviation");
        expect(group).toHaveProperty("stagedCount");
        expect(group).toHaveProperty("assignedCount");
      }
    });
  });

  // ── PATCH /admin/marketplace-groups/:marketplace/:id ──────────────────────

  describe("PATCH /admin/marketplace-groups/:marketplace/:id", () => {
    it("updates a group name", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/marketplace-groups/tcgplayer/10100", {
          name: "MKG Alpha Set Revised",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("clears a group name with null", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/marketplace-groups/cardmarket/10101", {
          name: null,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("GET reflects the updated names", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      const json = await res.json();

      const tcgplayerGroup = json.groups.find(
        (g: { marketplace: string; groupId: number }) =>
          g.marketplace === "tcgplayer" && g.groupId === 10_100,
      );
      expect(tcgplayerGroup.name).toBe("MKG Alpha Set Revised");

      const cardmarketGroup = json.groups.find(
        (g: { marketplace: string; groupId: number }) =>
          g.marketplace === "cardmarket" && g.groupId === 10_101,
      );
      expect(cardmarketGroup.name).toBeNull();
    });
  });
});
