import { describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  refreshCardAggregates,
  syncCardCardTypes,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const USER_ID = "a0000000-0017-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

let card1Id: string;
let setId: string;
let printing1Id: string;
let cs1Id: string;
let cs2Id: string;

let card3Id: string;
let printing2Id: string;
let cs3Id: string;

if (ctx) {
  const { db } = ctx;

  const [set] = await db
    .insertInto("sets")
    .values({ slug: "CSQ-TEST", name: "CSQ Test Set", printedTotal: 2, sortOrder: 102 })
    .returning("id")
    .execute();
  setId = set.id;

  const [card1] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-001",
      name: "CSQ Test Card",
      type: "unit",
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: ["Flash"],
      tags: [],
      comment: "Curator note on the card.",
    })
    .returning("id")
    .execute();
  card1Id = card1.id;
  await syncCardCardTypes(db);

  await db
    .insertInto("cardDomains")
    .values({ cardId: card1Id, domainSlug: "mind", ordinal: 0 })
    .execute();

  const [card2] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-002",
      name: "CSQ Another Card",
      type: "spell",
      might: null,
      energy: 1,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  await syncCardCardTypes(db);

  await db
    .insertInto("cardDomains")
    .values({ cardId: card2.id, domainSlug: "calm", ordinal: 0 })
    .execute();

  // Card 3: has a printing with NO active front image (covers listCardsWithMissingImages)
  const [card3] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-003",
      name: "CSQ No Image Card",
      type: "unit",
      might: 3,
      energy: 4,
      power: 1,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  card3Id = card3.id;
  await syncCardCardTypes(db);

  await db
    .insertInto("cardDomains")
    .values({ cardId: card3Id, domainSlug: "fury", ordinal: 0 })
    .execute();

  // Every card must have at least its own normName as an alias.
  await db
    .insertInto("cardNameAliases")
    .values([
      { cardId: card1Id, normName: "csqtestcard" },
      { cardId: card2.id, normName: "csqanothercard" },
      { cardId: card3Id, normName: "csqnoimagecard" },
    ])
    .execute();

  const [printing1] = await db
    .insertInto("printings")
    .values({
      cardId: card1Id,
      setId,
      shortCode: "CSQ-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Artist A",
      publicCode: "CSQ",
      printedRulesText: "Flash",
      printedEffectText: null,
      flavorText: null,
      comment: "Curator note on the printing.",
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printing1Id = printing1.id;

  // Printing 2: for card3, has NO printing image (covers listCardIdsWithMissingImages)
  const [printing2] = await db
    .insertInto("printings")
    .values({
      cardId: card3Id,
      setId,
      shortCode: "CSQ-003",
      rarity: "uncommon",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Artist C",
      publicCode: "CSQ",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printing2Id = printing2.id;

  // Add an active front image for printing1 (so card1 is NOT missing images)
  const [csqImageFile] = await db
    .insertInto("imageFiles")
    .values({ originalUrl: "https://example.com/csq-001-front.png" })
    .returning("id")
    .execute();
  await db
    .insertInto("printingImages")
    .values({
      printingId: printing1Id,
      face: "front",
      imageFileId: csqImageFile.id,
      isActive: true,
    })
    .execute();

  // Create card sources (matched — name matches card1 via norm_name trigger)
  const [cs1] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csq-spreadsheet",
      name: "CSQ Test Card",
      types: ["unit"],
      superTypes: [],
      domains: ["mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      rulesText: "Flash",
      effectText: null,
      tags: [],
      shortCode: "CSQ-001",
      externalId: "CSQ-001",
      extraData: null,
    })
    .returning("id")
    .execute();
  cs1Id = cs1.id;

  // Create card source (unmatched — no card with this name)
  const [cs2] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csq-gallery",
      name: "CSQ Unknown Card",
      types: ["rune"],
      superTypes: [],
      domains: ["chaos"],
      might: null,
      energy: 3,
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
  cs2Id = cs2.id;

  // Candidate card matched to card3 (covers candidateCardsByNormNames etc.)
  const [cs3] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csq-spreadsheet",
      name: "CSQ No Image Card",
      types: ["unit"],
      superTypes: [],
      domains: ["fury"],
      might: 3,
      energy: 4,
      power: 1,
      mightBonus: null,
      rulesText: null,
      effectText: null,
      tags: [],
      shortCode: "CSQ-003",
      externalId: "CSQ-003",
      extraData: null,
    })
    .returning("id")
    .execute();
  cs3Id = cs3.id;

  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs1Id,
      printingId: printing1Id,
      shortCode: "CSQ-001",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Artist A",
      publicCode: "CSQ",
      printedRulesText: "Flash",
      printedEffectText: null,
      imageUrl: "https://example.com/csq-test.png",
      flavorText: null,
      externalId: "test-entity",
      extraData: null,
    })
    .execute();

  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs2Id,
      printingId: null,
      shortCode: "CSQ-UNK-001",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "rare",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSQ",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      externalId: "test-entity",
      extraData: null,
    })
    .execute();

  // Candidate printing linked to card3's printing (covers candidatePrintingsForCandidateCards)
  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs3Id,
      printingId: printing2Id,
      shortCode: "CSQ-003",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "uncommon",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Artist C",
      publicCode: "CSQ",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      externalId: "CSQ-003-ps",
      extraData: null,
    })
    .execute();

  // Unlinked candidate printing for card3 (covers unlinked grouping in detail)
  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs3Id,
      printingId: null,
      shortCode: "CSQ-003",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "uncommon",
      artVariant: "altart",
      isSigned: false,
      finish: "foil",
      artist: "Artist C",
      publicCode: "CSQ",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/csq-003-alt.png",
      flavorText: null,
      externalId: "CSQ-003-alt",
      extraData: null,
    })
    .execute();

  // Mark "csq-spreadsheet" as a favorite provider (needed for unchecked count tests)
  await db
    .insertInto("providerSettings")
    .values({
      provider: "csq-spreadsheet",
      isFavorite: true,
      isHidden: false,
      helperReviewable: false,
      sortOrder: 0,
    })
    .onConflict((oc) => oc.column("provider").doUpdateSet({ isFavorite: true }))
    .execute();

  await refreshCardAggregates(db);
}

describe.skipIf(!ctx)("Card-sources query routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db: testDb } = ctx!;

  describe("GET /admin/cards/all-cards", () => {
    it("returns all cards including CSQ cards", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/all-cards"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));

      const csqCards = json.filter((c: { slug: string }) => c.slug.startsWith("CSQ-"));
      expect(csqCards).toHaveLength(3);

      // Ordered by name: "CSQ Another Card" before "CSQ No Image Card" before "CSQ Test Card"
      const sorted = csqCards.sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      );
      expect(sorted[0].name).toBe("CSQ Another Card");
      expect(sorted[1].name).toBe("CSQ No Image Card");
      expect(sorted[2].name).toBe("CSQ Test Card");
    });

    it("returns correct shape (id, slug, name, type, types, setSlugs, shortCodes)", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/all-cards"));
      const json = await readJson(res);

      const csqCard = json.find((c: { slug: string }) => c.slug === "CSQ-001");
      expect(csqCard).toBeDefined();
      expect(csqCard.id).toBeTypeOf("string");
      expect(csqCard.slug).toBeTypeOf("string");
      expect(csqCard.name).toBeTypeOf("string");
      expect(csqCard.type).toBeTypeOf("string");
      // Full ordered type set alongside the primary `type` scalar.
      expect(csqCard.types).toEqual(["unit"]);
      expect(Array.isArray(csqCard.setSlugs)).toBe(true);
      // The printing short codes the card picker ranks against.
      expect(Array.isArray(csqCard.shortCodes)).toBe(true);
      expect(Object.keys(csqCard).sort()).toEqual([
        "id",
        "name",
        "setSlugs",
        "shortCodes",
        "slug",
        "type",
        "types",
      ]);
    });

    it("includes the set slugs of accepted printings in setSlugs", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/all-cards"));
      const json = await readJson(res);
      const card1 = json.find((c: { slug: string }) => c.slug === "CSQ-001");
      const card2 = json.find((c: { slug: string }) => c.slug === "CSQ-002");
      // CSQ-001 has a printing in CSQ-TEST; the aggregated setSlugs drives
      // the admin list filter and detail prev/next scoping.
      expect(card1.setSlugs).toEqual(["CSQ-TEST"]);
      expect(card2.setSlugs).toEqual([]);
    });
  });

  describe("GET /admin/cards/provider-names", () => {
    it("returns distinct source names including CSQ sources", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/provider-names"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));
      expect(json).toContain("csq-gallery");
      expect(json).toContain("csq-spreadsheet");
    });
  });

  describe("GET /admin/cards/provider-stats", () => {
    it("returns per-source counts for CSQ sources", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/provider-stats"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));

      const gallery = json.find((s: { provider: string }) => s.provider === "csq-gallery");
      expect(gallery).toBeDefined();
      expect(gallery.cardCount).toBe(1);
      expect(gallery.printingCount).toBe(1);
      expect(gallery.lastUpdated).toBeTypeOf("string");

      const spreadsheet = json.find((s: { provider: string }) => s.provider === "csq-spreadsheet");
      expect(spreadsheet).toBeDefined();
      expect(spreadsheet.cardCount).toBe(2);
      // 1 from cs1 + 2 from cs3 = 3
      expect(spreadsheet.printingCount).toBe(3);
    });
  });

  describe("GET /admin/cards/", () => {
    it("returns CSQ cards and unmatched groups", async () => {
      const res = await app.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));

      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      expect(testCard.cardSlug).toBe("CSQ-001");
      expect(testCard.name).toBe("CSQ Test Card");
      expect(testCard.candidateCount).toBeGreaterThanOrEqual(1);

      // CSQ Another Card is an orphan: it has no candidate_cards.
      const anotherCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-002");
      expect(anotherCard).toBeDefined();
      expect(anotherCard.cardSlug).toBe("CSQ-002");
      expect(anotherCard.candidateCount).toBe(0);

      const unmatched = json.find(
        (r: { cardSlug: string | null; name: string }) =>
          r.cardSlug === null && r.name === "CSQ Unknown Card",
      );
      expect(unmatched).toBeDefined();
      expect(unmatched.normalizedName).toBe("csqunknowncard");
      expect(unmatched.stagingShortCodes).toContain("CSQ-UNK-001");
    });

    it("includes unchecked counts for CSQ Test Card", async () => {
      const res = await app.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      const total = Number(testCard.uncheckedCardCount) + Number(testCard.uncheckedPrintingCount);
      expect(total).toBeGreaterThan(0);
    });

    it("includes unmatched groups with cardId null", async () => {
      const res = await app.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      const unmatched = json.find((r: { name: string }) => r.name === "CSQ Unknown Card");
      expect(unmatched).toBeDefined();
      expect(unmatched.cardSlug).toBeNull();
    });
  });

  describe("GET /admin/cards/export", () => {
    it("returns all cards including CSQ cards with printings", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/export"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));

      // Export uses short_code, which is the card slug.
      const csqExport = json.filter((e: { card: { short_code: string } }) =>
        e.card.short_code?.startsWith("CSQ-"),
      );
      expect(csqExport).toHaveLength(3);

      const sorted = csqExport.sort(
        (a: { card: { name: string } }, b: { card: { name: string } }) =>
          a.card.name.localeCompare(b.card.name),
      );
      expect(sorted[0].card.name).toBe("CSQ Another Card");
      expect(sorted[0].printings).toEqual(expect.any(Array));
      expect(sorted[0].printings).toHaveLength(0);

      expect(sorted[1].card.name).toBe("CSQ No Image Card");
      expect(sorted[1].printings).toEqual(expect.any(Array));
      expect(sorted[1].printings).toHaveLength(1);

      expect(sorted[2].card.name).toBe("CSQ Test Card");
      expect(sorted[2].printings).toEqual(expect.any(Array));
      expect(sorted[2].printings).toHaveLength(1);
      expect(sorted[2].printings[0].short_code).toBe("CSQ-001");
      expect(sorted[2].printings[0].set_id).toBe("CSQ-TEST");
      expect(sorted[2].printings[0].rarity).toBe("common");
    });

    it("carries the curator comments on cards and printings", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/export"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      const testCard = json.find(
        (e: { card: { short_code: string } }) => e.card.short_code === "CSQ-001",
      );
      expect(testCard.card.comment).toBe("Curator note on the card.");
      expect(testCard.printings[0].comment).toBe("Curator note on the printing.");

      const noImageCard = json.find(
        (e: { card: { short_code: string } }) => e.card.short_code === "CSQ-003",
      );
      expect(noImageCard.card.comment).toBeNull();
      expect(noImageCard.printings[0].comment).toBeNull();
    });
  });

  describe("GET /admin/cards/:cardId", () => {
    it("returns card detail with sources and printings", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-001"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.card).toBeDefined();
      expect(json.card.slug).toBe("CSQ-001");
      expect(json.card.name).toBe("CSQ Test Card");
      // The detail card carries the full ordered type set, no scalar.
      expect(json.card.types).toEqual(["unit"]);
      expect(json.card.domains).toEqual(["mind"]);
      expect(json.card.energy).toBe(2);
      expect(json.card.keywords).toEqual(["Flash"]);

      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const spreadsheetSource = json.sources.find(
        (s: { provider: string }) => s.provider === "csq-spreadsheet",
      );
      expect(spreadsheetSource).toBeDefined();
      expect(spreadsheetSource.name).toBe("CSQ Test Card");
      expect(spreadsheetSource.shortCode).toBe("CSQ-001");

      expect(json.printings).toEqual(expect.any(Array));
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].shortCode).toBe("CSQ-001");
      expect(json.printings[0].rarity).toBe("common");
      expect(json.printings[0].setId).toBe("CSQ-TEST");
    });

    it("response includes candidatePrintings", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-001"));
      const json = await readJson(res);

      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings.length).toBeGreaterThanOrEqual(1);

      const ps = json.candidatePrintings[0];
      expect(ps.shortCode).toBe("CSQ-001");
      expect(ps.setId).toBe("CSQ-TEST");
      expect(ps.rarity).toBe("common");
      expect(ps.imageUrl).toBe("https://example.com/csq-test.png");
      expect(ps.candidateCardId).toBeTypeOf("string");
      expect(ps.checkedAt).toSatisfy((v: unknown) => v === null || typeof v === "string");
    });

    it("returns printingImages array", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-001"));
      const json = await readJson(res);

      expect(json.printingImages).toEqual(expect.any(Array));
    });

    it("returns 500 when card exists but has no name alias", async () => {
      // Delete the alias to simulate a broken state.
      await testDb.deleteFrom("cardNameAliases").where("normName", "=", "csqtestcard").execute();

      const res = await app.fetch(adminReq("GET", "/cards/CSQ-001"));
      expect(res.status).toBe(500);

      const json = await readJson(res);
      expect(json.code).toBe("MISSING_ALIAS");

      await testDb
        .insertInto("cardNameAliases")
        .values({ cardId: card1Id, normName: "csqtestcard" })
        .execute();
    });

    it("returns 200 with card null for non-existent slug", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/does-not-exist"));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.card).toBeNull();
    });
  });

  describe("GET /admin/cards/distinct-artists", () => {
    it("returns distinct artist names from published printings", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/distinct-artists"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual(expect.any(Array));
      expect(json).toContain("Artist A");
      expect(json).toContain("Artist C");
    });
  });

  describe("GET /admin/cards/:cardId (extended coverage)", () => {
    it("returns card detail for a card with missing images", async () => {
      // CSQ-003 has a printing but no active front image.
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-003"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.card).toBeDefined();
      expect(json.card.slug).toBe("CSQ-003");
      expect(json.card.name).toBe("CSQ No Image Card");

      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const src = json.sources.find((s: { provider: string }) => s.provider === "csq-spreadsheet");
      expect(src).toBeDefined();

      expect(json.printings).toEqual(expect.any(Array));
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].shortCode).toBe("CSQ-003");
      expect(json.printings[0].setId).toBe("CSQ-TEST");
      // setId is resolved to the set slug.
      expect(json.printings[0].setSlug).toBe("CSQ-TEST");
      expect(json.printingImages).toEqual(expect.any(Array));

      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings.length).toBeGreaterThanOrEqual(1);

      expect(json.candidatePrintingGroups).toEqual(expect.any(Array));
      expect(json.candidatePrintingGroups.length).toBeGreaterThanOrEqual(1);

      expect(json.setTotals).toBeDefined();
    });

    it("includes expectedCardId in card detail", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-001"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.expectedCardId).toBeTypeOf("string");
    });

    it("includes setTotals object", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/CSQ-003"));
      const json = await readJson(res);
      // CSQ-TEST set has printedTotal: 2.
      expect(json.setTotals).toBeDefined();
      expect(typeof json.setTotals).toBe("object");
    });
  });

  describe("GET /admin/cards/ (extended coverage)", () => {
    it("includes CSQ-003 card with candidate counts and missing image info", async () => {
      const res = await app.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      const card3 = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-003");
      expect(card3).toBeDefined();
      expect(card3.name).toBe("CSQ No Image Card");
      expect(card3.candidateCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /admin/cards/new/:name", () => {
    it("returns unmatched sources for a normalized name", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/new/csqunknowncard"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.displayName).toBe("CSQ Unknown Card");

      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].provider).toBe("csq-gallery");
      expect(json.sources[0].name).toBe("CSQ Unknown Card");
      expect(json.sources[0].types).toEqual(["rune"]);
      expect(json.sources[0].domains).toEqual(["chaos"]);

      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings).toHaveLength(1);
      expect(json.candidatePrintings[0].shortCode).toBe("CSQ-UNK-001");
      expect(json.candidatePrintings[0].rarity).toBe("rare");
    });

    it("returns 200 with empty sources for non-existent normalized name", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/new/nonexistent"));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources).toHaveLength(0);
    });

    it("includes candidatePrintingGroups and defaultCardId for unmatched", async () => {
      const res = await app.fetch(adminReq("GET", "/cards/new/csqunknowncard"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.candidatePrintingGroups).toEqual(expect.any(Array));
      expect(json.candidatePrintingGroups.length).toBeGreaterThanOrEqual(1);
      expect(json.defaultCardId).toBeTypeOf("string");
    });
  });
});
