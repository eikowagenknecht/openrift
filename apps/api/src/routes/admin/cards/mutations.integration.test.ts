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
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: ["Flash"],
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  await db.insertInto("cardDomains").values({ cardId, domainSlug: "Mind", ordinal: 0 }).execute();

  // Printing 1
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "CSM-001",
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
      cardId,
      setId,
      shortCode: "CSM-002",
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
      printingId,
      shortCode: "CSM-001",
      setId: "CSM-TEST",
      setName: "CSM Test Set",
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
      externalId: "CSM-ACCEPT-001",
      extraData: null,
    })
    .returning("id")
    .execute();
  psForAcceptNewId = psAcceptNew.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const P = "/admin/cards";

describe.skipIf(!ctx)("Card-sources mutation routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

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

  describe("POST /candidate-printings/:id/check", () => {
    it("marks a printing source as checked", async () => {
      // Reset checkedAt
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", psId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/candidate-printings/${psId}/check`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/candidate-printings/${fakeId}/check`));
      expect(res.status).toBe(404);
    });
  });

  // ── Printing-sources check-all ──────────────────────────────────────────

  describe("POST /candidate-printings/check-all", () => {
    it("marks all printing sources for a printing as checked", async () => {
      // Reset
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("printingId", "=", printingId)
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/check-all`, { printingId }),
      );
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
        req("POST", `${P}/candidate-printings/check-all`, {
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

      const res = await app.fetch(req("POST", `${P}/${cardId}/check-all`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.updated).toBeGreaterThanOrEqual(1);
    });

    it("returns 404 for non-existent card slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/00000000-0000-4000-a000-000000000000/check-all`),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH printing-source ───────────────────────────────────────────────

  describe("PATCH /candidate-printings/:id", () => {
    it("updates rarity on a printing source", async () => {
      const res = await app.fetch(
        req("PATCH", `${P}/candidate-printings/${psId}`, { rarity: "Rare" }),
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
        req("PATCH", `${P}/candidate-printings/${psId}`, {
          artVariant: "altart",
          finish: "foil",
          isSigned: true,
          setId: "CSM-TEST",
          shortCode: "CSM-PATCHED",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("candidatePrintings")
        .select(["artVariant", "finish", "isSigned", "setId", "shortCode"])
        .where("id", "=", psId)
        .executeTakeFirstOrThrow();
      expect(row.artVariant).toBe("altart");
      expect(row.finish).toBe("foil");
      expect(row.isSigned).toBe(true);
      expect(row.shortCode).toBe("CSM-PATCHED");

      // Restore for subsequent tests
      await db
        .updateTable("candidatePrintings")
        .set({
          artVariant: "normal",
          finish: "normal",
          isSigned: false,
          shortCode: "CSM-001",
          rarity: "Common",
        })
        .where("id", "=", psId)
        .execute();
    });

    it("returns 400 for empty update", async () => {
      const res = await app.fetch(req("PATCH", `${P}/candidate-printings/${psId}`, {}));
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PATCH", `${P}/candidate-printings/${fakeId}`, { rarity: "Rare" }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Copy printing-source ────────────────────────────────────────────────

  describe("POST /candidate-printings/:id/copy", () => {
    it("copies a printing source to another printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/${psId}/copy`, {
          printingId: printing2Id,
        }),
      );
      expect(res.status).toBe(204);

      // Verify a new candidate_printing was created linked to printing2
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
        req("POST", `${P}/candidate-printings/${fakeId}/copy`, {
          printingId: printing2Id,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent target printing", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000001";
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/${psId}/copy`, {
          printingId: fakeId,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty printingId", async () => {
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/${psId}/copy`, {
          printingId: "",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Link / unlink candidate-printings ──────────────────────────────────────

  describe("POST /candidate-printings/link", () => {
    it("links candidate printings to a printing by UUID", async () => {
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/link`, {
          candidatePrintingIds: [psUnlinkedId],
          printingId: printing2Id,
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
        req("POST", `${P}/candidate-printings/link`, {
          candidatePrintingIds: [psUnlinkedId],
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

    it("returns 500 for non-existent target printing UUID", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000001";
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/link`, {
          candidatePrintingIds: [psUnlinkedId],
          printingId: fakeId,
        }),
      );
      // Link with non-existent UUID violates FK constraint
      expect(res.status).toBe(500);
    });

    it("returns 400 for empty candidatePrintingIds array", async () => {
      const res = await app.fetch(
        req("POST", `${P}/candidate-printings/link`, {
          candidatePrintingIds: [],
          printingId: printing2Id,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Rename card slug ────────────────────────────────────────────────────

  describe("POST /:cardId/rename", () => {
    it("renames a card slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/rename`, { newId: "CSM-001-RENAMED" }),
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
      const res = await app.fetch(req("POST", `${P}/${cardId}/rename`, { newId: "CSM-001" }));
      expect(res.status).toBe(204);
    });

    it("same name is a no-op", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardId}/rename`, { newId: cardSlug }));
      expect(res.status).toBe(204);
    });

    it("returns 400 for empty newId", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardId}/rename`, { newId: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── Accept card field ───────────────────────────────────────────────────

  describe("POST /:cardId/accept-field", () => {
    it("updates card name", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
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
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "name",
          value: "CSM Test Card",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 400 when updating rulesText (no longer an allowed field)", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "rulesText",
          value: "[Shield]. [Tank]",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when updating effectText (no longer an allowed field)", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "effectText",
          value: "[Vision]",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("updates energy field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
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
        req("POST", `${P}/${cardId}/accept-field`, {
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
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "type",
          value: "InvalidType",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
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
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "artist",
          value: "Artist B",
        }),
      );
      expect(res.status).toBe(204);

      // Verify
      const row = await db
        .selectFrom("printings")
        .select("artist")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.artist).toBe("Artist B");
    });

    it("updates rarity on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "rarity",
          value: "Rare",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("rarity")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.rarity).toBe("Rare");

      // Restore
      await db
        .updateTable("printings")
        .set({ rarity: "Common" })
        .where("id", "=", printingId)
        .execute();
    });

    it("returns 400 for validation error on rarity", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "rarity",
          value: "InvalidRarity",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("updates finish on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "finish",
          value: "foil",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("finish")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.finish).toBe("foil");

      // Restore
      await db
        .updateTable("printings")
        .set({ finish: "normal" })
        .where("id", "=", printingId)
        .execute();
    });

    it("returns 400 for validation error on finish", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "finish",
          value: "invalid-finish",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("updates comment on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "comment",
          value: "Test comment",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("comment")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.comment).toBe("Test comment");

      // Clear
      await db
        .updateTable("printings")
        .set({ comment: null })
        .where("id", "=", printingId)
        .execute();
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "nonexistent",
          value: "foo",
        }),
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

      // Verify alias was created (every accepted card must have at least one)
      const alias = await db
        .selectFrom("cardNameAliases")
        .select("cardId")
        .where("normName", "=", "csmnewcard")
        .executeTakeFirst();
      expect(alias).toBeDefined();
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
          externalId: "csm-link-unmatched",
          extraData: null,
        })
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/new/csmanotherunmatched/link`, {
          cardId,
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
          cardId: "00000000-0000-4000-a000-000000000000",
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
          externalId: "CSM-AP-001",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-001",
            setId: "CSM-TEST",
            setName: "CSM Test Set",
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
          candidatePrintingIds: [apPs.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.printingId).toBeTypeOf("string");

      // Verify the printing was created
      const printing = await db
        .selectFrom("printings")
        .select(["id", "rarity", "artist"])
        .where("id", "=", json.printingId)
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

    it("accepts a printing with foil finish", async () => {
      const [apPs2] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: null,
          shortCode: "CSM-AP-FOIL",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
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
          externalId: "CSM-AP-FOIL",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-FOIL",
            setId: "CSM-TEST",
            rarity: "Epic",
            finish: "foil",
            artist: "Custom Artist",
            publicCode: "CSM",
          },
          candidatePrintingIds: [apPs2.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.printingId).toBeTypeOf("string");
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
          rarity: "Common",
          artVariant: "normal",
          isSigned: true,
          promoTypeId,
          finish: "foil",
          artist: "Promo Artist",
          publicCode: "CSM",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "CSM-AP-PROMO",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-PROMO",
            setId: "CSM-TEST",
            rarity: "Common",
            finish: "foil",
            isSigned: true,
            promoTypeId,
            artist: "Promo Artist",
            publicCode: "CSM",
          },
          candidatePrintingIds: [apPs3.id],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.printingId).toBeTypeOf("string");

      // Verify isSigned/promoTypeId on the printing
      const p = await db
        .selectFrom("printings")
        .select(["isSigned", "promoTypeId"])
        .where("id", "=", json.printingId)
        .executeTakeFirstOrThrow();
      expect(p.isSigned).toBe(true);
      expect(p.promoTypeId).toBe(promoTypeId);
    });

    it("returns 400 for empty candidatePrintingIds", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-X",
            artist: "X",
            publicCode: "X",
          },
          candidatePrintingIds: [],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent card", async () => {
      const res = await app.fetch(
        req("POST", `${P}/00000000-0000-4000-a000-000000000000/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-X",
            setId: "CSM",
            artist: "X",
            publicCode: "X",
          },
          candidatePrintingIds: [psId],
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
          externalId: "CSM-AP-NEWSET",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-printing`, {
          printingFields: {
            shortCode: "CSM-AP-NEWSET",
            setId: "CSM-NEW-SET",
            setName: "CSM Brand New Set",
            rarity: "Common",
            finish: "normal",
            artist: "A",
            publicCode: "X",
          },
          candidatePrintingIds: [apPs4.id],
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
          provider: "csm-test-upload",
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
      expect(json.newCards).toBeTypeOf("number");
      expect(json.updates).toBeTypeOf("number");
      expect(json.unchanged).toBeTypeOf("number");
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          provider: "",
          candidates: [{ card: { name: "X", type: "Unit" }, printings: [] }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty candidates", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          provider: "csm-test-upload",
          candidates: [],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Delete printing-source ──────────────────────────────────────────────
  // (placed near the end since it removes seed data)

  describe("DELETE /candidate-printings/:id", () => {
    it("deletes a printing source", async () => {
      // Use the unlinked one to avoid FK issues
      const res = await app.fetch(req("DELETE", `${P}/candidate-printings/${psUnlinkedId}`));
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
      const res = await app.fetch(req("DELETE", `${P}/candidate-printings/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── Uncheck card source ──────────────────────────────────────────────────

  describe("POST /:candidateCardId/uncheck", () => {
    it("unchecks a checked candidate card", async () => {
      // Ensure the card is checked first
      await db
        .updateTable("candidateCards")
        .set({ checkedAt: new Date() })
        .where("id", "=", cardShortCode)
        .execute();

      const res = await app.fetch(req("POST", `${P}/${cardShortCode}/uncheck`));
      expect(res.status).toBe(204);

      // Verify unchecked
      const row = await db
        .selectFrom("candidateCards")
        .select("checkedAt")
        .where("id", "=", cardShortCode)
        .executeTakeFirstOrThrow();
      expect(row.checkedAt).toBeNull();
    });

    it("returns 404 for non-existent candidate card", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/${fakeId}/uncheck`));
      expect(res.status).toBe(404);
    });
  });

  // ── Uncheck printing source ────────────────────────────────────────────

  describe("POST /candidate-printings/:id/uncheck", () => {
    it("unchecks a checked candidate printing", async () => {
      // Ensure the printing is checked first
      await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where("id", "=", psId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/candidate-printings/${psId}/uncheck`));
      expect(res.status).toBe(204);

      // Verify unchecked
      const row = await db
        .selectFrom("candidatePrintings")
        .select("checkedAt")
        .where("id", "=", psId)
        .executeTakeFirstOrThrow();
      expect(row.checkedAt).toBeNull();
    });

    it("returns 404 for non-existent candidate printing", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/candidate-printings/${fakeId}/uncheck`));
      expect(res.status).toBe(404);
    });
  });

  // ── Accept-field with provider source (typography fixes) ──────────────

  describe("POST /:cardId/accept-field (provider source)", () => {
    it("applies typography fixes when source is provider", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "name",
          value: 'Some "quoted" name',
          source: "provider",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select("name")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      // fixTypography converts straight quotes to curly quotes
      expect(row.name).toBeDefined();

      // Restore
      await db
        .updateTable("cards")
        .set({ name: "CSM Test Card" })
        .where("slug", "=", cardSlug)
        .execute();
    });

    it("normalizes null to empty array for array fields like superTypes", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "superTypes",
          value: null,
        }),
      );
      expect(res.status).toBe(204);

      const rows = await db
        .selectFrom("cardSuperTypes")
        .select("superTypeSlug")
        .where("cardId", "=", cardId)
        .execute();
      expect(rows).toEqual([]);
    });

    it("normalizes null to empty array for tags field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "tags",
          value: null,
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select("tags")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.tags).toEqual([]);
    });

    it("returns 400 for missing field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardId}/accept-field`, {
          field: "",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when updating rulesText on non-existent card (field rejected before lookup)", async () => {
      const res = await app.fetch(
        req("POST", `${P}/NONEXISTENT-SLUG/accept-field`, {
          field: "rulesText",
          value: "test",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept printing field (extended coverage) ─────────────────────────

  describe("POST /printing/:printingId/accept-field (extended)", () => {
    it("applies typography to printedRulesText from provider source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "printedRulesText",
          value: 'Deal "damage" to target',
          source: "provider",
        }),
      );
      expect(res.status).toBe(204);

      // Verify the value was set (typography may have changed quotes)
      const row = await db
        .selectFrom("printings")
        .select("printedRulesText")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.printedRulesText).toBeDefined();

      // Restore
      await db
        .updateTable("printings")
        .set({ printedRulesText: "Flash" })
        .where("id", "=", printingId)
        .execute();
    });

    it("applies typography to printedEffectText from provider source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "printedEffectText",
          value: "Effect text here",
          source: "provider",
        }),
      );
      expect(res.status).toBe(204);

      // Restore
      await db
        .updateTable("printings")
        .set({ printedEffectText: null })
        .where("id", "=", printingId)
        .execute();
    });

    it("applies typography to flavorText from provider source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "flavorText",
          value: 'Some "flavor" (with parens)',
          source: "provider",
        }),
      );
      expect(res.status).toBe(204);

      // Restore
      await db
        .updateTable("printings")
        .set({ flavorText: null })
        .where("id", "=", printingId)
        .execute();
    });

    it("appends set total to publicCode from provider source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "publicCode",
          value: "CSM-001",
          source: "provider",
        }),
      );
      expect(res.status).toBe(204);

      // The set has printedTotal=2, so publicCode should be appended
      const row = await db
        .selectFrom("printings")
        .select("publicCode")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.publicCode).toBeDefined();

      // Restore
      await db
        .updateTable("printings")
        .set({ publicCode: "CSM" })
        .where("id", "=", printingId)
        .execute();
    });

    it("resolves setId from slug to UUID when accepting setId field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "setId",
          value: "CSM-TEST",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 404 when setting setId to non-existent slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "setId",
          value: "NONEXISTENT-SET",
        }),
      );
      expect(res.status).toBe(404);
    });

    it("updates promoTypeId", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "promoTypeId",
          value: promoTypeId,
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("promoTypeId")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.promoTypeId).toBe(promoTypeId);

      // Restore: set promoTypeId back to null
      await db
        .updateTable("printings")
        .set({ promoTypeId: null })
        .where("id", "=", printingId)
        .execute();
    });

    it("returns 400 for missing field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/${printingId}/accept-field`, {
          field: "",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Delete printing ────────────────────────────────────────────────────

  describe("DELETE /printing/:printingId", () => {
    it("deletes a printing and cleans up related data", async () => {
      // Create a disposable printing for this test
      const [disposablePrinting] = await db
        .insertInto("printings")
        .values({
          cardId,
          setId,
          shortCode: "CSM-DELETE-TEST",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Del Artist",
          publicCode: "CSM",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        })
        .returning("id")
        .execute();

      // Add an image to the printing (create card_image first, then link via printing_image)
      const [cardImage] = await db
        .insertInto("imageFiles")
        .values({ originalUrl: "https://example.com/delete-test.png" })
        .returning("id")
        .execute();
      await db
        .insertInto("printingImages")
        .values({
          printingId: disposablePrinting.id,
          face: "front",
          provider: "test",
          imageFileId: cardImage.id,
          isActive: true,
        })
        .execute();

      // Create a candidate printing linked to this printing
      await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: csForAcceptNewId,
          printingId: disposablePrinting.id,
          shortCode: "CSM-DELETE-TEST",
          setId: "CSM-TEST",
          setName: "CSM Test Set",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Del Artist",
          publicCode: "CSM",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "CSM-DELETE-TEST-PS",
          extraData: null,
        })
        .execute();

      const res = await app.fetch(req("DELETE", `${P}/printing/${disposablePrinting.id}`));
      expect(res.status).toBe(204);

      // Verify printing is gone
      const row = await db
        .selectFrom("printings")
        .select("id")
        .where("id", "=", disposablePrinting.id)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });

  // ── Check by provider ──────────────────────────────────────────────────

  describe("POST /by-provider/:provider/check", () => {
    it("marks all candidates for a provider as checked", async () => {
      // Reset all csm-gallery candidates to unchecked
      await db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("provider", "=", "csm-gallery")
        .execute();
      // Also reset candidate printings for that provider
      const ccIds = await db
        .selectFrom("candidateCards")
        .select("id")
        .where("provider", "=", "csm-gallery")
        .execute();
      if (ccIds.length > 0) {
        await db
          .updateTable("candidatePrintings")
          .set({ checkedAt: null })
          .where(
            "candidateCardId",
            "in",
            ccIds.map((r) => r.id),
          )
          .execute();
      }

      const res = await app.fetch(req("POST", `${P}/by-provider/csm-gallery/check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.cardsChecked).toBeGreaterThanOrEqual(1);
      expect(json.printingsChecked).toBeTypeOf("number");
    });

    it("returns 400 for empty provider", async () => {
      const res = await app.fetch(req("POST", `${P}/by-provider/%20/check`));
      expect(res.status).toBe(400);
    });
  });

  // ── Link unmatched (extended) ──────────────────────────────────────────

  describe("POST /new/:name/link (extended)", () => {
    it("returns 400 for missing cardId", async () => {
      const res = await app.fetch(
        req("POST", `${P}/new/somename/link`, {
          cardId: "",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept new card (extended) ─────────────────────────────────────────

  describe("POST /new/:name/accept (extended)", () => {
    it("returns 400 for missing cardFields", async () => {
      const res = await app.fetch(req("POST", `${P}/new/somename/accept`, {}));
      expect(res.status).toBe(400);
    });
  });

  // ── Delete by source ────────────────────────────────────────────────────
  // (last — removes all card_sources for a source, cascading to printing_sources)

  describe("DELETE /by-provider/:source", () => {
    it("deletes all card sources for a source name", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-provider/csm-spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.provider).toBe("csm-spreadsheet");
      expect(json.deleted).toBeGreaterThanOrEqual(1);
    });

    it("returns 0 deleted for already-cleaned source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-provider/csm-spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.deleted).toBe(0);
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-provider/%20`));
      expect(res.status).toBe(400);
    });
  });
});
