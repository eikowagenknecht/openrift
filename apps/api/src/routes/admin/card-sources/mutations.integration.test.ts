import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources mutation routes
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CSM- for entities it creates.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0018-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed IDs — assigned during setup
let setId = "";
let cardId = "";
const cardSlug = "CSM-001";
let printingId = "";
let printing2Id = "";
let cardShortCode = "";
let csUnmatchedId = "";
let psId = "";
let psUnlinkedId = "";
let psForAcceptNewId = "";
let csForAcceptNewId = "";
let promoTypeId = "";

if (ctx) {
  const { db } = ctx;

  // Set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "CSM-TEST", name: "CSM Test Set", printedTotal: 2, sortOrder: 103 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Promo type (for accept-printing promo test) — seeded by migration 034
  const promoTypeRow = await db
    .selectFrom("promoTypes")
    .select("id")
    .where("slug", "=", "promo")
    .executeTakeFirstOrThrow();
  promoTypeId = promoTypeRow.id;

  // Card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "CSM-001",
      name: "CSM Test Card",
      type: "Unit",
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: ["Flash"],
      rulesText: "Flash",
      effectText: null,
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  // Printing 1
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      slug: "CSM-001:common:normal:",
      cardId: cardId,
      setId: setId,
      shortCode: "CSM-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Artist A",
      publicCode: "CSM",
      printedRulesText: "Flash",
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Printing 2 (for copy/link tests)
  const [printing2Row] = await db
    .insertInto("printings")
    .values({
      slug: "CSM-001:rare:foil:",
      cardId: cardId,
      setId: setId,
      shortCode: "CSM-001",
      collectorNumber: 1,
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "foil",
      artist: "Artist A",
      publicCode: "CSM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printing2Id = printing2Row.id;

  // Card source (matched to card by name)
  const [csRow] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csm-spreadsheet",
      name: "CSM Test Card",
      type: "Unit",
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      rulesText: "Flash",
      effectText: null,
      tags: [],
      shortCode: "CSM-001",
      externalId: "CSM-001",
      extraData: null,
    })
    .returning("id")
    .execute();
  cardShortCode = csRow.id;

  // Card source (unmatched)
  const [csUnmatchedRow] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csm-gallery",
      name: "CSM New Card",
      type: "Spell",
      superTypes: [],
      domains: ["Calm"],
      might: null,
      energy: 1,
      power: null,
      mightBonus: null,
      rulesText: null,
      effectText: null,
      tags: [],
      shortCode: null,
      externalId: "test-entity",
      extraData: null,
    })
    .returning("id")
    .execute();
  csUnmatchedId = csUnmatchedRow.id;

  // Printing source (linked to printing)
  const [psRow] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cardShortCode,
      printingId: printingId,
      shortCode: "CSM-001",
      setId: "CSM-TEST",
      setName: "CSM Test Set",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Artist A",
      publicCode: "CSM",
      printedRulesText: "Flash",
      printedEffectText: null,
      imageUrl: "https://example.com/csm-test.png",
      flavorText: null,
      externalId: "test-entity",
      extraData: null,
    })
    .returning("id")
    .execute();
  psId = psRow.id;

  // Printing source (unlinked)
  const [psUnlinkedRow] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: csUnmatchedId,
      printingId: null,
      shortCode: "CSM-NEW-001",
      setId: "CSM-TEST",
      setName: "CSM Test Set",
      collectorNumber: 99,
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSM",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      externalId: "test-entity",
      extraData: null,
    })
    .returning("id")
    .execute();
  psUnlinkedId = psUnlinkedRow.id;

  // Card source for accept-new tests (matched to existing card by name)
  const [csForAcceptNew] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csm-accept-new-src",
      name: "CSM Test Card",
      type: "Unit",
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      rulesText: "Flash",
      effectText: null,
      tags: [],
      shortCode: "CSM-ACCEPT-001",
      externalId: "CSM-ACCEPT-001",
      extraData: null,
    })
    .returning("id")
    .execute();
  csForAcceptNewId = csForAcceptNew.id;

  // Printing source for accept-new: valid, unlinked
  const [psAcceptNew] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: csForAcceptNewId,
      printingId: null,
      shortCode: "CSM-ACCEPT-001",
      setId: "CSM-TEST",
      setName: "CSM Test Set",
      collectorNumber: 50,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Accept Artist",
      publicCode: "CSM",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/accept-new.png",
      flavorText: "Some flavor",
      externalId: "test-entity",
      extraData: null,
    })
    .returning("id")
    .execute();
  psForAcceptNewId = psAcceptNew.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const P = "/admin/card-sources";

describe.skipIf(!ctx)("Card-sources mutation routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── Auto-check ──────────────────────────────────────────────────────────

  describe("POST /auto-check", () => {
    it("bulk-marks matching sources as checked", async () => {
      const res = await app.fetch(req("POST", `${P}/auto-check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.candidateCardsChecked).toBeGreaterThanOrEqual(1);
      expect(json.candidatePrintingsChecked).toBeGreaterThanOrEqual(1);
    });

    it("second call marks 0 (already checked)", async () => {
      const res = await app.fetch(req("POST", `${P}/auto-check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.candidateCardsChecked).toBe(0);
      expect(json.candidatePrintingsChecked).toBe(0);
    });
  });

  // ── Single card-source check ────────────────────────────────────────────

  describe("POST /:cardSourceId/check", () => {
    it("marks a card source as checked", async () => {
      // Reset checkedAt so the test is meaningful
      await db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("id", "=", cardShortCode)
        .execute();

      const res = await app.fetch(req("POST", `${P}/${cardShortCode}/check`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for non-existent card source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/${fakeId}/check`));
      expect(res.status).toBe(404);
    });
  });

  // ── Single printing-source check ────────────────────────────────────────

  describe("POST /printing-sources/:id/check", () => {
    it("marks a printing source as checked", async () => {
      // Reset checkedAt
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", psId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/printing-sources/${psId}/check`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/printing-sources/${fakeId}/check`));
      expect(res.status).toBe(404);
    });
  });

  // ── Printing-sources check-all ──────────────────────────────────────────

  describe("POST /printing-sources/check-all", () => {
    it("marks all printing sources for a printing as checked", async () => {
      // Reset
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("printingId", "=", printingId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/printing-sources/check-all`, { printingId }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.updated).toBeGreaterThanOrEqual(1);
    });

    it("marks extra IDs alongside the printing", async () => {
      // Reset both the printing-linked and an extra source
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("printingId", "=", printingId)
        .execute();
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", psForAcceptNewId)
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/printing-sources/check-all`, {
          printingId,
          extraIds: [psForAcceptNewId],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.updated).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Card check-all by slug ──────────────────────────────────────────────

  describe("POST /:cardId/check-all", () => {
    it("marks all card sources for a card slug as checked", async () => {
      // Reset
      await db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("id", "=", cardShortCode)
        .execute();

      const res = await app.fetch(req("POST", `${P}/${cardSlug}/check-all`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.updated).toBeGreaterThanOrEqual(1);
    });

    it("returns 404 for non-existent card slug", async () => {
      const res = await app.fetch(req("POST", `${P}/NONEXISTENT-SLUG/check-all`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH printing-source ───────────────────────────────────────────────

  describe("PATCH /printing-sources/:id", () => {
    it("updates rarity on a printing source", async () => {
      const res = await app.fetch(
        req("PATCH", `${P}/printing-sources/${psId}`, { rarity: "Rare" }),
      );
      expect(res.status).toBe(204);

      // Verify update persisted
      const row = await db
        .selectFrom("candidatePrintings")
        .select("rarity")
        .where("id", "=", psId)
        .executeTakeFirstOrThrow();
      expect(row.rarity).toBe("Rare");
    });

    it("updates multiple fields at once", async () => {
      const res = await app.fetch(
        req("PATCH", `${P}/printing-sources/${psId}`, {
          artVariant: "altart",
          finish: "foil",
          isSigned: true,
          collectorNumber: 42,
          setId: "CSM-TEST",
          shortCode: "CSM-PATCHED",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("candidatePrintings")
        .select(["artVariant", "finish", "isSigned", "collectorNumber", "setId", "shortCode"])
        .where("id", "=", psId)
        .executeTakeFirstOrThrow();
      expect(row.artVariant).toBe("altart");
      expect(row.finish).toBe("foil");
      expect(row.isSigned).toBe(true);
      expect(row.collectorNumber).toBe(42);
      expect(row.shortCode).toBe("CSM-PATCHED");

      // Restore for subsequent tests
      await db
        .updateTable("candidatePrintings")
        .set({
          artVariant: "normal",
          finish: "normal",
          isSigned: false,
          collectorNumber: 1,
          shortCode: "CSM-001",
          rarity: "Common",
        })
        .where("id", "=", psId)
        .execute();
    });

    it("returns 400 for empty update", async () => {
      const res = await app.fetch(req("PATCH", `${P}/printing-sources/${psId}`, {}));
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PATCH", `${P}/printing-sources/${fakeId}`, { rarity: "Rare" }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Copy printing-source ────────────────────────────────────────────────

  describe("POST /printing-sources/:id/copy", () => {
    it("copies a printing source to another printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${psId}/copy`, {
          printingId: "CSM-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(204);

      // Verify a new printing_source was created linked to printing2
      const copies = await db
        .selectFrom("candidatePrintings")
        .select("id")
        .where("printingId", "=", printing2Id)
        .execute();
      expect(copies.length).toBeGreaterThanOrEqual(1);
    });

    it("returns 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${fakeId}/copy`, {
          printingId: "CSM-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent target printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${psId}/copy`, {
          printingId: "NONEXISTENT:slug:",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Link / unlink printing-sources ──────────────────────────────────────

  describe("POST /printing-sources/link", () => {
    it("links printing sources to a printing by slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/link`, {
          printingSourceIds: [psUnlinkedId],
          printingId: "CSM-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(204);

      // Verify link
      const row = await db
        .selectFrom("candidatePrintings")
        .select("printingId")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirstOrThrow();
      expect(row.printingId).toBe(printing2Id);
    });

    it("unlinks printing sources (printingId=null)", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/link`, {
          printingSourceIds: [psUnlinkedId],
          printingId: null,
        }),
      );
      expect(res.status).toBe(204);

      // Verify unlinked
      const row = await db
        .selectFrom("candidatePrintings")
        .select("printingId")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirstOrThrow();
      expect(row.printingId).toBeNull();
    });

    it("returns 404 for non-existent target printing slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/link`, {
          printingSourceIds: [psUnlinkedId],
          printingId: "NONEXISTENT:slug:",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Rename card slug ────────────────────────────────────────────────────

  describe("POST /:cardId/rename", () => {
    it("renames a card slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/rename`, { newId: "CSM-001-RENAMED" }),
      );
      expect(res.status).toBe(204);

      // Verify
      const row = await db
        .selectFrom("cards")
        .select("slug")
        .where("id", "=", cardId)
        .executeTakeFirstOrThrow();
      expect(row.slug).toBe("CSM-001-RENAMED");
    });

    it("rename back for subsequent tests", async () => {
      const res = await app.fetch(req("POST", `${P}/CSM-001-RENAMED/rename`, { newId: "CSM-001" }));
      expect(res.status).toBe(204);
    });

    it("same name is a no-op", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardSlug}/rename`, { newId: cardSlug }));
      expect(res.status).toBe(204);
    });

    it("returns 400 for empty newId", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardSlug}/rename`, { newId: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── Accept card field ───────────────────────────────────────────────────

  describe("POST /:cardId/accept-field", () => {
    it("updates card name", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "name",
          value: "CSM Test Card Updated",
        }),
      );
      expect(res.status).toBe(204);

      // Verify
      const row = await db
        .selectFrom("cards")
        .select("name")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.name).toBe("CSM Test Card Updated");
    });

    it("restore original name for subsequent tests", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "name",
          value: "CSM Test Card",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("updates rulesText and recomputes keywords", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "rulesText",
          value: "[Shield]. [Tank]",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select(["rulesText", "keywords"])
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.rulesText).toBe("[Shield]. [Tank]");
      expect(row.keywords).toContain("Shield");
      expect(row.keywords).toContain("Tank");
    });

    it("updates effectText and recomputes keywords", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "effectText",
          value: "[Vision]",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select(["effectText", "keywords"])
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.effectText).toBe("[Vision]");
      expect(row.keywords).toContain("Vision");
      // rulesText keywords should also be preserved
      expect(row.keywords).toContain("Shield");
      expect(row.keywords).toContain("Tank");

      // Restore
      await db
        .updateTable("cards")
        .set({ rulesText: "Flash", effectText: null, keywords: ["Flash"] })
        .where("slug", "=", cardSlug)
        .execute();
    });

    it("updates energy field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "energy",
          value: 5,
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select("energy")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.energy).toBe(5);

      // Restore
      await db.updateTable("cards").set({ energy: 2 }).where("slug", "=", cardSlug).execute();
    });

    it("updates type field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "type",
          value: "Spell",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select("type")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.type).toBe("Spell");

      // Restore
      await db.updateTable("cards").set({ type: "Unit" }).where("slug", "=", cardSlug).execute();
    });

    it("returns 400 for validation error on type", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "type",
          value: "InvalidType",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "nonexistent",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept printing field ───────────────────────────────────────────────

  describe("POST /printing/:printingId/accept-field", () => {
    it("updates artist on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "artist",
          value: "Artist B",
        }),
      );
      expect(res.status).toBe(204);

      // Verify
      const row = await db
        .selectFrom("printings")
        .select("artist")
        .where("slug", "=", "CSM-001:common:normal:")
        .executeTakeFirstOrThrow();
      expect(row.artist).toBe("Artist B");
    });

    it("updates rarity on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "rarity",
          value: "Rare",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("rarity")
        .where("slug", "=", "CSM-001:common:normal:")
        .executeTakeFirstOrThrow();
      expect(row.rarity).toBe("Rare");

      // Restore
      await db
        .updateTable("printings")
        .set({ rarity: "Common" })
        .where("slug", "=", "CSM-001:common:normal:")
        .execute();
    });

    it("returns 400 for validation error on rarity", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "rarity",
          value: "InvalidRarity",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("updates finish on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "finish",
          value: "foil",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("finish")
        .where("slug", "=", "CSM-001:common:normal:")
        .executeTakeFirstOrThrow();
      expect(row.finish).toBe("foil");

      // Restore
      await db
        .updateTable("printings")
        .set({ finish: "normal" })
        .where("slug", "=", "CSM-001:common:normal:")
        .execute();
    });

    it("returns 400 for validation error on finish", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "finish",
          value: "invalid-finish",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("updates comment on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "comment",
          value: "Test comment",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("comment")
        .where("slug", "=", "CSM-001:common:normal:")
        .executeTakeFirstOrThrow();
      expect(row.comment).toBe("Test comment");

      // Clear
      await db
        .updateTable("printings")
        .set({ comment: null })
        .where("slug", "=", "CSM-001:common:normal:")
        .execute();
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/accept-field`, {
          field: "nonexistent",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Rename printing ─────────────────────────────────────────────────────

  describe("POST /printing/:printingId/rename", () => {
    it("renames a printing slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/rename`, {
          newId: "CSM-001:common:normal:v2",
        }),
      );
      expect(res.status).toBe(204);

      // Verify
      const row = await db
        .selectFrom("printings")
        .select("slug")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.slug).toBe("CSM-001:common:normal:v2");
    });

    it("rename back for subsequent tests", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:v2/rename`, {
          newId: "CSM-001:common:normal:",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("same name is a no-op", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/rename`, {
          newId: "CSM-001:common:normal:",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 400 for empty newId", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/CSM-001:common:normal:/rename`, { newId: "" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept new card from unmatched sources ──────────────────────────────

  describe("POST /new/:name/accept", () => {
    it("creates a new card from unmatched source data", async () => {
      const res = await app.fetch(
        req("POST", `${P}/new/csmnewcard/accept`, {
          cardFields: {
            id: "CSM-NEW-001",
            name: "CSM New Card",
            type: "Spell",
            domains: ["Calm"],
            energy: 1,
          },
        }),
      );
      expect(res.status).toBe(204);

      // Verify card was created
      const card = await db
        .selectFrom("cards")
        .select(["slug", "name", "type"])
        .where("slug", "=", "CSM-NEW-001")
        .executeTakeFirst();
      expect(card).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(card!.name).toBe("CSM New Card");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(card!.type).toBe("Spell");
    });
  });

  // ── Link unmatched sources to existing card ─────────────────────────────

  describe("POST /new/:name/link", () => {
    it("links unmatched sources to an existing card", async () => {
      // Create another unmatched card source for this test
      await db
        .insertInto("candidateCards")
        .values({
          provider: "csm-gallery",
          name: "CSM Another Unmatched",
          type: "Rune",
          superTypes: [],
          domains: ["Mind"],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "test-entity",
          extraData: null,
        })
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/new/csmanotherunmatched/link`, {
          cardId: cardSlug,
        }),
      );
      expect(res.status).toBe(204);

      // Verify alias was created
      const alias = await db
        .selectFrom("cardNameAliases")
        .select("cardId")
        .where("normName", "=", "csmanotherunmatched")
        .executeTakeFirst();
      expect(alias).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(alias!.cardId).toBe(cardId);
    });

    it("returns 404 for non-existent target card", async () => {
      const res = await app.fetch(
        req("POST", `${P}/new/csmanotherunmatched/link`, {
          cardId: "NONEXISTENT-SLUG",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Accept printing (create new printing from admin-selected fields) ────

  describe("POST /:cardId/accept-printing", () => {
    it("creates a new printing and links sources", async () => {
      // Create a dedicated printing source for this test
      const [apPs] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: null,
          shortCode: "CSM-AP-001",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
          collectorNumber: 60,
          rarity: "Uncommon",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "AP Artist",
          publicCode: "CSM",
          printedRulesText: "Some rules",
          printedEffectText: null,
          imageUrl: "https://example.com/ap.png",
          flavorText: "AP Flavor",
          externalId: "test-entity",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-001",
            setId: "CSM-TEST",
            setName: "CSM Test Set",
            collectorNumber: 60,
            rarity: "Uncommon",
            artVariant: "normal",
            finish: "normal",
            artist: "AP Artist",
            publicCode: "CSM",
            printedRulesText: "Some rules",
            printedEffectText: null,
            flavorText: "AP Flavor",
            imageUrl: "https://example.com/ap.png",
          },
          printingSourceIds: [apPs.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.printingId).toBe("CSM-AP-001:uncommon:normal:");

      // Verify the printing was created
      const printing = await db
        .selectFrom("printings")
        .select(["slug", "rarity", "artist"])
        .where("slug", "=", "CSM-AP-001:uncommon:normal:")
        .executeTakeFirst();
      expect(printing).toBeDefined();
      // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
      expect(printing!.rarity).toBe("Uncommon");

      // Verify the printing source was linked and checked
      const ps = await db
        .selectFrom("candidatePrintings")
        .select(["printingId", "checkedAt"])
        .where("id", "=", apPs.id)
        .executeTakeFirstOrThrow();
      expect(ps.printingId).toBeTruthy();
      expect(ps.checkedAt).toBeTruthy();
    });

    it("accepts a printing with custom id override", async () => {
      const [apPs2] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: null,
          shortCode: "CSM-AP-CUSTOM",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
          collectorNumber: 61,
          rarity: "Epic",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "foil",
          artist: "Custom Artist",
          publicCode: "CSM",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "test-entity",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-printing`, {
          printingFields: {
            id: "CSM-CUSTOM-ID",
            shortCode: "CSM-AP-CUSTOM",
            setId: "CSM-TEST",
            collectorNumber: 61,
            rarity: "Epic",
            finish: "foil",
            artist: "Custom Artist",
            publicCode: "CSM",
          },
          printingSourceIds: [apPs2.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.printingId).toBe("CSM-CUSTOM-ID");
    });

    it("accepts a printing with promo and signed flags", async () => {
      const [apPs3] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: null,
          shortCode: "CSM-AP-PROMO",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
          collectorNumber: 62,
          rarity: "Common",
          artVariant: "normal",
          isSigned: true,
          promoTypeId: promoTypeId,
          finish: "foil",
          artist: "Promo Artist",
          publicCode: "CSM",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "test-entity",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-PROMO",
            setId: "CSM-TEST",
            collectorNumber: 62,
            rarity: "Common",
            finish: "foil",
            isSigned: true,
            promoTypeId: promoTypeId,
            artist: "Promo Artist",
            publicCode: "CSM",
          },
          printingSourceIds: [apPs3.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      // promo type slug results in a "promo" suffix in the slug
      expect(json.printingId).toBe("CSM-AP-PROMO:common:foil:promo");

      // Verify isSigned/promoTypeId on the printing
      const p = await db
        .selectFrom("printings")
        .select(["isSigned", "promoTypeId"])
        .where("slug", "=", json.printingId)
        .executeTakeFirstOrThrow();
      expect(p.isSigned).toBe(true);
      expect(p.promoTypeId).toBe(promoTypeId);
    });

    it("returns 400 for empty printingSourceIds", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-X",
            collectorNumber: 70,
            artist: "X",
            publicCode: "X",
          },
          printingSourceIds: [],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent card", async () => {
      const res = await app.fetch(
        req("POST", `${P}/NONEXISTENT-CARD/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-X",
            setId: "CSM",
            collectorNumber: 70,
            artist: "X",
            publicCode: "X",
          },
          printingSourceIds: [psId],
        }),
      );
      expect(res.status).toBe(404);
    });

    it("upserts set when setId is a new slug", async () => {
      const [apPs4] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: null,
          shortCode: "CSM-AP-NEWSET",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
          collectorNumber: 71,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "A",
          publicCode: "X",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "test-entity",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-NEWSET",
            setId: "CSM-NEW-SET",
            setName: "CSM Brand New Set",
            collectorNumber: 71,
            rarity: "Common",
            finish: "normal",
            artist: "A",
            publicCode: "X",
          },
          printingSourceIds: [apPs4.id],
        }),
      );
      expect(res.status).toBe(200);

      // Verify the new set was created
      const setRow = await db
        .selectFrom("sets")
        .select("name")
        .where("slug", "=", "CSM-NEW-SET")
        .executeTakeFirst();
      expect(setRow).toBeDefined();
      // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
      expect(setRow!.name).toBe("CSM Brand New Set");
    });
  });

  // ── Upload card sources ─────────────────────────────────────────────────

  describe("POST /upload", () => {
    it("uploads card sources and returns counts", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "csm-test-upload",
          candidates: [
            {
              card: {
                name: "CSM Upload Card",
                type: "Unit",
                super_types: [],
                domains: ["Mind"],
                might: null,
                energy: 3,
                power: null,
                might_bonus: null,
                rules_text: null,
                effect_text: null,
                tags: [],
                short_code: "CSM-UPLOAD-001",
                external_id: "CSM-UPLOAD-001",
              },
              printings: [
                {
                  short_code: "CSM-UPLOAD-001",
                  external_id: "CSM-UPLOAD-001",
                  set_id: "CSM-TEST",
                  set_name: "CSM Test Set",
                  collector_number: 10,
                  rarity: "Common",
                  art_variant: "normal",
                  is_signed: false,
                  is_promo: false,
                  finish: "normal",
                  artist: "Upload Artist",
                  public_code: "CSM",
                  printed_rules_text: "",
                  printed_effect_text: "",
                },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.newCards).toBeNumber();
      expect(json.updates).toBeNumber();
      expect(json.unchanged).toBeNumber();
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "",
          candidates: [{ card: { name: "X", type: "Unit" }, printings: [] }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty candidates", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "csm-test-upload",
          candidates: [],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Delete printing-source ──────────────────────────────────────────────
  // (placed near the end since it removes seed data)

  describe("DELETE /printing-sources/:id", () => {
    it("deletes a printing source", async () => {
      // Use the unlinked one to avoid FK issues
      const res = await app.fetch(req("DELETE", `${P}/printing-sources/${psUnlinkedId}`));
      expect(res.status).toBe(204);

      // Verify gone
      const row = await db
        .selectFrom("candidatePrintings")
        .select("id")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `${P}/printing-sources/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── Delete by source ────────────────────────────────────────────────────
  // (last — removes all card_sources for a source, cascading to printing_sources)

  describe("DELETE /by-source/:source", () => {
    it("deletes all card sources for a source name", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/csm-spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.source).toBe("csm-spreadsheet");
      expect(json.deleted).toBeGreaterThanOrEqual(1);
    });

    it("returns 0 deleted for already-cleaned source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/csm-spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.deleted).toBe(0);
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/%20`));
      expect(res.status).toBe(400);
    });
  });
});
