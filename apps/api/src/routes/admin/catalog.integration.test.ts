import { describe, expect, it } from "vitest";

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

// Store UUIDs returned by POST so subsequent tests can use them
const setIds: Record<string, string> = {};

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
      expect(res.status).toBe(201);
      const json = await res.json();
      setIds["CAT-core-set"] = json.id;
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
      expect(res.status).toBe(201);
      const json = await res.json();
      setIds["CAT-expansion-one"] = json.id;
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
      expect(json.sets).toEqual(expect.any(Array));

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "CAT-core-set");
      expect(coreSet).toBeDefined();
      expect(coreSet.id).toBeTypeOf("string");
      expect(coreSet.slug).toBe("CAT-core-set");
      expect(coreSet.name).toBe("CAT Core Set");
      expect(coreSet.printedTotal).toBe(200);
      expect(coreSet.sortOrder).toBeTypeOf("number");
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
    it("returns 404 when updating a non-existent set", async () => {
      const fakeUuid = "00000000-0000-4000-a000-ffffffffffff";
      const res = await app.fetch(
        req("PATCH", `/admin/sets/${fakeUuid}`, {
          name: "Ghost Set",
          printedTotal: 0,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe("NOT_FOUND");
    });

    it("updates a set", async () => {
      const res = await app.fetch(
        req("PATCH", `/admin/sets/${setIds["CAT-core-set"]}`, {
          name: "CAT Core Set Revised",
          printedTotal: 210,
          releasedAt: "2025-02-01",
        }),
      );
      expect(res.status).toBe(204);
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
      // Get all sets to include in the reorder (must include all UUIDs)
      const getRes = await app.fetch(req("GET", "/admin/sets"));
      const getJson = await getRes.json();
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);

      // Move CAT-expansion-one before CAT-core-set by reversing the order
      const coreId = setIds["CAT-core-set"];
      const expId = setIds["CAT-expansion-one"];
      const reordered = allIds.filter((id) => id !== coreId && id !== expId);
      reordered.push(expId, coreId);

      const res = await app.fetch(
        req("PUT", "/admin/sets/reorder", {
          ids: reordered,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("reflects the new order on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      const catSets = json.sets.filter((s: { slug: string }) => s.slug.startsWith("CAT-"));
      expect(catSets[0].slug).toBe("CAT-expansion-one");
      expect(catSets[1].slug).toBe("CAT-core-set");
    });

    it("rejects partial reorder (400)", async () => {
      const res = await app.fetch(
        req("PUT", "/admin/sets/reorder", {
          ids: [setIds["CAT-core-set"]],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects reorder with duplicate set IDs (400)", async () => {
      const getRes = await app.fetch(req("GET", "/admin/sets"));
      const getJson = await getRes.json();
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);
      const duped = [...allIds];
      duped[duped.length - 1] = duped[0];

      const res = await app.fetch(req("PUT", "/admin/sets/reorder", { ids: duped }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("BAD_REQUEST");
      expect(json.error).toContain("Duplicate");
    });

    it("rejects reorder with unknown set IDs (400)", async () => {
      const getRes = await app.fetch(req("GET", "/admin/sets"));
      const getJson = await getRes.json();
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);
      const withUnknown = [...allIds];
      withUnknown[0] = "00000000-0000-4000-a000-ffffffffffff";

      const res = await app.fetch(req("PUT", "/admin/sets/reorder", { ids: withUnknown }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("BAD_REQUEST");
      expect(json.error).toContain("Unknown");
    });
  });

  // ── DELETE /admin/sets/:id ──────────────────────────────────────────────

  describe("DELETE /admin/sets/:id", () => {
    it("returns 400 for non-UUID id", async () => {
      const res = await app.fetch(req("DELETE", "/admin/sets/CAT-does-not-exist"));
      expect(res.status).toBe(400);
    });

    it("returns 409 when deleting a set that still has printings", async () => {
      const createRes = await app.fetch(
        req("POST", "/admin/sets", {
          id: "CAT-has-prints",
          name: "CAT Has Prints",
          printedTotal: 1,
          releasedAt: null,
        }),
      );
      expect(createRes.status).toBe(201);
      const { id: tempSetId } = await createRes.json();

      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const { db: testDb } = ctx!;
      const [tempCard] = await testDb
        .insertInto("cards")
        .values({
          slug: "CAT-PRINT-001",
          name: "CAT Print Card",
          type: "Unit",
          superTypes: [],
          domains: ["Mind"],
          might: null,
          energy: 1,
          power: null,
          mightBonus: null,
          keywords: [],
          rulesText: null,
          effectText: null,
          tags: [],
        })
        .returning("id")
        .execute();

      await testDb
        .insertInto("printings")
        .values({
          slug: "CAT-PRINT-001:normal:",
          cardId: tempCard.id,
          setId: tempSetId,
          shortCode: "CAT-PRINT-001",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Test",
          publicCode: "CAT",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        })
        .execute();

      const delRes = await app.fetch(req("DELETE", `/admin/sets/${tempSetId}`));
      expect(delRes.status).toBe(409);
      const delJson = await delRes.json();
      expect(delJson.code).toBe("CONFLICT");
      expect(delJson.error).toContain("printing");

      // Clean up
      await testDb.deleteFrom("printings").where("slug", "=", "CAT-PRINT-001:normal:").execute();
      await testDb.deleteFrom("cards").where("slug", "=", "CAT-PRINT-001").execute();
      await app.fetch(req("DELETE", `/admin/sets/${tempSetId}`));
    });

    it("deletes an empty set", async () => {
      const res = await app.fetch(req("DELETE", `/admin/sets/${setIds["CAT-expansion-one"]}`));
      expect(res.status).toBe(204);
    });

    it("set no longer appears in GET after deletion", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      const deleted = json.sets.find((s: { slug: string }) => s.slug === "CAT-expansion-one");
      expect(deleted).toBeUndefined();
    });

    it("deletes the remaining test set", async () => {
      const res = await app.fetch(req("DELETE", `/admin/sets/${setIds["CAT-core-set"]}`));
      expect(res.status).toBe(204);
    });
  });
});
