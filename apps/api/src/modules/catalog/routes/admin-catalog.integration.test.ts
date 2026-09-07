import { describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  syncCardCardTypes,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// Requires INTEGRATION_DB_URL. Uses prefix CAT- for set slugs/names, group_id range 10000-10099.

const USER_ID = "a0000000-0011-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

if (ctx) {
  const { db } = ctx;

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

const setIds: Record<string, string> = {};

describe.skipIf(!ctx)("Admin catalog routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // The shared DB has seed data (OGS set); tests create new sets with a
  // CAT- prefix and verify only their own sets are in the response.

  describe("POST /admin/sets", () => {
    it("creates a set", async () => {
      const res = await app.fetch(
        adminReq("POST", "/sets", {
          id: "CAT-core-set",
          name: "CAT Core Set",
          printedTotal: 200,
          releases: { EN: { releasedAt: "2025-01-15", precision: "day" } },
          setType: "main",
        }),
      );
      expect(res.status).toBe(201);
      const json = await readJson(res);
      setIds["CAT-core-set"] = json.id;
    });

    it("creates a second set", async () => {
      const res = await app.fetch(
        adminReq("POST", "/sets", {
          id: "CAT-expansion-one",
          name: "CAT Expansion One",
          printedTotal: 150,
          // Not the column default, so the GET below can assert it survived the insert.
          setType: "supplemental",
        }),
      );
      expect(res.status).toBe(201);
      const json = await readJson(res);
      setIds["CAT-expansion-one"] = json.id;
    });

    it("returns 409 for duplicate slug", async () => {
      const res = await app.fetch(
        adminReq("POST", "/sets", {
          id: "CAT-core-set",
          name: "Duplicate Core Set",
          printedTotal: 100,
          setType: "main",
        }),
      );
      expect(res.status).toBe(409);
    });

    it("validates required fields (400)", async () => {
      const res = await app.fetch(adminReq("POST", "/sets", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty id", async () => {
      const res = await app.fetch(
        adminReq("POST", "/sets", {
          id: "",
          name: "Bad Set",
          printedTotal: 0,
          setType: "main",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(
        adminReq("POST", "/sets", {
          id: "CAT-bad-set",
          name: "",
          printedTotal: 0,
          setType: "main",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /admin/sets (after creation)", () => {
    it("returns created sets with correct shape", async () => {
      const res = await app.fetch(adminReq("GET", "/sets"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.sets).toEqual(expect.any(Array));

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "CAT-core-set");
      expect(coreSet).toBeDefined();
      expect(coreSet.id).toBeTypeOf("string");
      expect(coreSet.slug).toBe("CAT-core-set");
      expect(coreSet.name).toBe("CAT Core Set");
      expect(coreSet.printedTotal).toBe(200);
      expect(coreSet.sortOrder).toBeTypeOf("number");
      expect(coreSet.releases).toEqual({ EN: { releasedAt: "2025-01-15", precision: "day" } });
      expect(coreSet.setType).toBe("main");
      expect(coreSet.cardCount).toBe(0);
      expect(coreSet.printingCount).toBe(0);

      const expansion = json.sets.find((s: { slug: string }) => s.slug === "CAT-expansion-one");
      expect(expansion.setType).toBe("supplemental");
    });

    it("sets are ordered by sort_order", async () => {
      const res = await app.fetch(adminReq("GET", "/sets"));
      const json = await readJson(res);

      const catSets = json.sets.filter((s: { slug: string }) => s.slug.startsWith("CAT-"));
      expect(catSets).toHaveLength(2);
      expect(catSets[0].slug).toBe("CAT-core-set");
      expect(catSets[1].slug).toBe("CAT-expansion-one");
    });
  });

  describe("PATCH /admin/sets/:id", () => {
    it("returns 404 when updating a non-existent set", async () => {
      const fakeUuid = "00000000-0000-4000-a000-ffffffffffff";
      const res = await app.fetch(
        adminReq("PATCH", `/sets/${fakeUuid}`, {
          name: "Ghost Set",
          printedTotal: 0,
          releases: {},
          setType: "main",
        }),
      );
      expect(res.status).toBe(404);
      const json = await readJson(res);
      expect(json.code).toBe("NOT_FOUND");
    });

    it("updates a set", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/sets/${setIds["CAT-core-set"]}`, {
          name: "CAT Core Set Revised",
          printedTotal: 210,
          releases: {
            EN: { releasedAt: "2025-02-01", precision: "day" },
            FR: { releasedAt: "2025-04-01", precision: "quarter" },
          },
          setType: "main",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("reflects the updated values on GET", async () => {
      const res = await app.fetch(adminReq("GET", "/sets"));
      const json = await readJson(res);

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "CAT-core-set");
      expect(coreSet.name).toBe("CAT Core Set Revised");
      expect(coreSet.printedTotal).toBe(210);
      // The PATCH replaces the whole map, so French is added and English moves.
      expect(coreSet.releases).toEqual({
        EN: { releasedAt: "2025-02-01", precision: "day" },
        FR: { releasedAt: "2025-04-01", precision: "quarter" },
      });
    });
  });

  describe("PUT /admin/sets/reorder", () => {
    it("reorders sets", async () => {
      // The reorder endpoint requires all UUIDs to be present.
      const getRes = await app.fetch(adminReq("GET", "/sets"));
      const getJson = await readJson(getRes);
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);

      const coreId = setIds["CAT-core-set"]!;
      const expId = setIds["CAT-expansion-one"]!;
      const reordered = allIds.filter((id) => id !== coreId && id !== expId);
      reordered.push(expId, coreId);

      const res = await app.fetch(
        adminReq("PUT", "/sets/reorder", {
          ids: reordered,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("reflects the new order on GET", async () => {
      const res = await app.fetch(adminReq("GET", "/sets"));
      const json = await readJson(res);

      const catSets = json.sets.filter((s: { slug: string }) => s.slug.startsWith("CAT-"));
      expect(catSets[0].slug).toBe("CAT-expansion-one");
      expect(catSets[1].slug).toBe("CAT-core-set");
    });

    it("rejects partial reorder (400)", async () => {
      const res = await app.fetch(
        adminReq("PUT", "/sets/reorder", {
          ids: [setIds["CAT-core-set"]],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects reorder with duplicate set IDs (400)", async () => {
      const getRes = await app.fetch(adminReq("GET", "/sets"));
      const getJson = await readJson(getRes);
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);
      const duped = [...allIds];
      duped[duped.length - 1] = duped[0]!;

      const res = await app.fetch(adminReq("PUT", "/sets/reorder", { ids: duped }));
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.code).toBe("BAD_REQUEST");
      expect(json.message).toContain("Duplicate");
    });

    it("rejects reorder with unknown set IDs (400)", async () => {
      const getRes = await app.fetch(adminReq("GET", "/sets"));
      const getJson = await readJson(getRes);
      const allIds: string[] = getJson.sets.map((s: { id: string }) => s.id);
      const withUnknown = [...allIds];
      withUnknown[0] = "00000000-0000-4000-a000-ffffffffffff";

      const res = await app.fetch(adminReq("PUT", "/sets/reorder", { ids: withUnknown }));
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.code).toBe("BAD_REQUEST");
      expect(json.message).toContain("Unknown");
    });
  });

  describe("DELETE /admin/sets/:id", () => {
    it("returns 400 for non-UUID id", async () => {
      const res = await app.fetch(adminReq("DELETE", "/sets/CAT-does-not-exist"));
      expect(res.status).toBe(400);
    });

    it("returns 409 when deleting a set that still has printings", async () => {
      const createRes = await app.fetch(
        adminReq("POST", "/sets", {
          id: "CAT-has-prints",
          name: "CAT Has Prints",
          printedTotal: 1,
          setType: "main",
        }),
      );
      expect(createRes.status).toBe(201);
      const { id: tempSetId } = await readJson(createRes);

      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const { db: testDb } = ctx!;
      const [tempCard] = await testDb
        .insertInto("cards")
        .values({
          slug: "CAT-PRINT-001",
          name: "CAT Print Card",
          type: "unit",
          might: null,
          energy: 1,
          power: null,
          mightBonus: null,
          keywords: [],
          tags: [],
        })
        .returning("id")
        .execute();
      await syncCardCardTypes(testDb);

      await testDb
        .insertInto("cardDomains")
        .values({ cardId: tempCard!.id, domainSlug: "mind", ordinal: 0 })
        .execute();

      await testDb
        .insertInto("printings")
        .values({
          cardId: tempCard!.id,
          setId: tempSetId,
          shortCode: "CAT-PRINT-001",
          rarity: "common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "Test",
          publicCode: "CAT",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
          size: "standard",
          language: "EN",
        })
        .execute();

      const delRes = await app.fetch(adminReq("DELETE", `/sets/${tempSetId}`));
      expect(delRes.status).toBe(409);
      const delJson = await readJson(delRes);
      expect(delJson.code).toBe("CONFLICT");
      expect(delJson.message).toContain("printing");

      await testDb.deleteFrom("printings").where("shortCode", "=", "CAT-PRINT-001").execute();
      await testDb.deleteFrom("cardDomains").where("cardId", "=", tempCard!.id).execute();
      await testDb.deleteFrom("cards").where("slug", "=", "CAT-PRINT-001").execute();
      await app.fetch(adminReq("DELETE", `/sets/${tempSetId}`));
    });

    it("deletes an empty set", async () => {
      const res = await app.fetch(adminReq("DELETE", `/sets/${setIds["CAT-expansion-one"]}`));
      expect(res.status).toBe(204);
    });

    it("set no longer appears in GET after deletion", async () => {
      const res = await app.fetch(adminReq("GET", "/sets"));
      const json = await readJson(res);

      const deleted = json.sets.find((s: { slug: string }) => s.slug === "CAT-expansion-one");
      expect(deleted).toBeUndefined();
    });

    it("deletes the remaining test set", async () => {
      const res = await app.fetch(adminReq("DELETE", `/sets/${setIds["CAT-core-set"]}`));
      expect(res.status).toBe(204);
    });
  });
});
