import { describe, expect, it } from "bun:test";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin catalog routes (sets + marketplace groups)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CAT- for set slugs/names, group_id range 10000-10099.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0011-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed admin-specific test data
if (ctx) {
  const { db } = ctx;

  // Seed a marketplace group for the cardmarket/tcgplayer tests
  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace: "cardmarket",
      groupId: 10_000,
      name: "CAT Test Expansion",
      abbreviation: null,
    })
    .execute();

  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace: "tcgplayer",
      groupId: 10_001,
      name: "CAT TCG Group",
      abbreviation: "CTG",
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Admin catalog routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // ── GET /admin/sets ─────────────────────────────────────────────────────
  // Note: The shared DB has seed data (OGS set). We test creating new sets
  // with a CAT- prefix and verify our sets are included in the response.

  // ── POST /admin/sets ──────────────────────────────────────────────────────

  describe("POST /admin/sets", () => {
    it("creates a set", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "CAT-core-set",
          name: "CAT Core Set",
          printedTotal: 200,
          releasedAt: "2025-01-15",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("creates a second set", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "CAT-expansion-one",
          name: "CAT Expansion One",
          printedTotal: 150,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 409 for duplicate slug", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "CAT-core-set",
          name: "Duplicate Core Set",
          printedTotal: 100,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(409);
    });

    it("validates required fields (400)", async () => {
      const res = await app.fetch(req("POST", "/admin/sets", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty id", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "",
          name: "Bad Set",
          printedTotal: 0,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "CAT-bad-set",
          name: "",
          printedTotal: 0,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/sets (after creation) ──────────────────────────────────────

  describe("GET /admin/sets (after creation)", () => {
    it("returns created sets with correct shape", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.sets).toBeArray();

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "CAT-core-set");
      expect(coreSet).toBeDefined();
      expect(coreSet.id).toBeString();
      expect(coreSet.slug).toBe("CAT-core-set");
      expect(coreSet.name).toBe("CAT Core Set");
      expect(coreSet.printedTotal).toBe(200);
      expect(coreSet.sortOrder).toBeNumber();
      expect(coreSet.releasedAt).toBe("2025-01-15");
      expect(coreSet.cardCount).toBe(0);
      expect(coreSet.printingCount).toBe(0);
    });

    it("sets are ordered by sort_order", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      // Find our CAT- sets and verify they are in order relative to each other
      const catSets = json.sets.filter((s: { slug: string }) => s.slug.startsWith("CAT-"));
      expect(catSets).toHaveLength(2);
      expect(catSets[0].slug).toBe("CAT-core-set");
      expect(catSets[1].slug).toBe("CAT-expansion-one");
    });
  });

  // ── PATCH /admin/sets/:id ─────────────────────────────────────────────────

  describe("PATCH /admin/sets/:id", () => {
    it("updates a set", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/sets/CAT-core-set", {
          name: "CAT Core Set Revised",
          printedTotal: 210,
          releasedAt: "2025-02-01",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the updated values on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "CAT-core-set");
      expect(coreSet.name).toBe("CAT Core Set Revised");
      expect(coreSet.printedTotal).toBe(210);
      expect(coreSet.releasedAt).toBe("2025-02-01");
    });
  });

  // ── PUT /admin/sets/reorder ───────────────────────────────────────────────

  describe("PUT /admin/sets/reorder", () => {
    it("reorders sets", async () => {
      // Get all sets to include in the reorder (must include all slugs)
      const getRes = await app.fetch(req("GET", "/admin/sets"));
      const getJson = await getRes.json();
      const allSlugs = getJson.sets.map((s: { slug: string }) => s.slug);

      // Move CAT-expansion-one before CAT-core-set by reversing the order
      const reordered = allSlugs.filter((s: string) => !s.startsWith("CAT-"));
      reordered.push("CAT-expansion-one", "CAT-core-set");

      const res = await app.fetch(
        req("PUT", "/admin/sets/reorder", {
          ids: reordered,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the new order on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      const catSets = json.sets.filter((s: { slug: string }) => s.slug.startsWith("CAT-"));
      expect(catSets[0].slug).toBe("CAT-expansion-one");
      expect(catSets[1].slug).toBe("CAT-core-set");
    });
  });

  // ── GET /admin/cardmarket-groups ──────────────────────────────────────────

  describe("GET /admin/cardmarket-groups", () => {
    it("returns expansions including seeded group", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.expansions).toBeArray();

      const catExpansion = json.expansions.find(
        (e: { expansionId: number }) => e.expansionId === 10_000,
      );
      expect(catExpansion).toBeDefined();
      expect(catExpansion.name).toBe("CAT Test Expansion");
      expect(catExpansion.stagedCount).toBe(0);
      expect(catExpansion.assignedCount).toBe(0);
    });
  });

  // ── PATCH /admin/cardmarket-groups/:id ────────────────────────────────────

  describe("PATCH /admin/cardmarket-groups/:id", () => {
    it("updates expansion name", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/cardmarket-groups/10000", {
          name: "CAT Renamed Expansion",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the updated name on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-groups"));
      const json = await res.json();

      const catExpansion = json.expansions.find(
        (e: { expansionId: number }) => e.expansionId === 10_000,
      );
      expect(catExpansion.name).toBe("CAT Renamed Expansion");
    });
  });

  // ── GET /admin/tcgplayer-groups ───────────────────────────────────────────

  describe("GET /admin/tcgplayer-groups", () => {
    it("returns groups including seeded group", async () => {
      const res = await app.fetch(req("GET", "/admin/tcgplayer-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();

      const catGroup = json.groups.find((g: { groupId: number }) => g.groupId === 10_001);
      expect(catGroup).toBeDefined();
      expect(catGroup.name).toBe("CAT TCG Group");
      expect(catGroup.abbreviation).toBe("CTG");
      expect(catGroup.stagedCount).toBe(0);
      expect(catGroup.assignedCount).toBe(0);
    });
  });
});
