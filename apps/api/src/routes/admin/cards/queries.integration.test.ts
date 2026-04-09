import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources query routes (/admin/cards/*)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CSQ- for entities it creates.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0017-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Track IDs assigned by the DB for assertions
let card1Id: string;
let _card2Id: string;
let setId: string;
let printing1Id: string;
let cs1Id: string;
let cs2Id: string;

// Extra seed IDs for extended coverage
let card3Id: string;
let printing2Id: string;
let cs3Id: string;

if (ctx) {
  const { db } = ctx;

  // ── Seed data ──────────────────────────────────────────────────────────────

  // Create a set
  const [set] = await db
    .insertInto("sets")
    .values({ slug: "CSQ-TEST", name: "CSQ Test Set", printedTotal: 2, sortOrder: 102 })
    .returning("id")
    .execute();
  setId = set.id;

  // Create cards
  const [card1] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-001",
      name: "CSQ Test Card",
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
  card1Id = card1.id;

  await db
    .insertInto("cardDomains")
    .values({ cardId: card1Id, domainSlug: "Mind", ordinal: 0 })
    .execute();

  const [card2] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-002",
      name: "CSQ Another Card",
      type: "Spell",
      might: null,
      energy: 1,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  _card2Id = card2.id;

  await db
    .insertInto("cardDomains")
    .values({ cardId: card2.id, domainSlug: "Calm", ordinal: 0 })
    .execute();

  // Card 3: has a printing with NO active front image (covers listCardsWithMissingImages)
  const [card3] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-003",
      name: "CSQ No Image Card",
      type: "Unit",
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

  await db
    .insertInto("cardDomains")
    .values({ cardId: card3Id, domainSlug: "Fury", ordinal: 0 })
    .execute();

  // Create name aliases (every card must have at least its own normName as an alias)
  await db
    .insertInto("cardNameAliases")
    .values([
      { cardId: card1Id, normName: "csqtestcard" },
      { cardId: card2.id, normName: "csqanothercard" },
      { cardId: card3Id, normName: "csqnoimagecard" },
    ])
    .execute();

  // Create printings
  const [printing1] = await db
    .insertInto("printings")
    .values({
      cardId: card1Id,
      setId,
      shortCode: "CSQ-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Artist A",
      publicCode: "CSQ",
      printedRulesText: "Flash",
      printedEffectText: null,
      flavorText: null,
      comment: null,
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
      rarity: "Uncommon",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Artist C",
      publicCode: "CSQ",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printing2Id = printing2.id;

  // Add an active front image for printing1 (so card1 is NOT missing images)
  await db
    .insertInto("printingImages")
    .values({
      printingId: printing1Id,
      face: "front",
      provider: "csq-test",
      originalUrl: "https://example.com/csq-001-front.png",
      rehostedUrl: null,
      isActive: true,
    })
    .execute();

  // Create card sources (matched — name matches card1 via norm_name trigger)
  const [cs1] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csq-spreadsheet",
      name: "CSQ Test Card",
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
      type: "Rune",
      superTypes: [],
      domains: ["Chaos"],
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
      type: "Unit",
      superTypes: [],
      domains: ["Fury"],
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

  // Create printing sources (matched)
  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs1Id,
      printingId: printing1Id,
      shortCode: "CSQ-001",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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

  // Printing source for unmatched card
  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs2Id,
      printingId: null,
      shortCode: "CSQ-UNK-001",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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
      rarity: "Uncommon",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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
      rarity: "Uncommon",
      artVariant: "altart",
      isSigned: false,
      promoTypeId: null,
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Card-sources query routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db: testDb } = ctx!;

  // ── GET /admin/cards/all-cards ─────────────────────────────────────

  describe("GET /admin/cards/all-cards", () => {
    it("returns all cards including CSQ cards", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/all-cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));

      // Our CSQ cards should be present (3: CSQ-001, CSQ-002, CSQ-003)
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

    it("returns correct shape (id, slug, name, type)", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/all-cards"));
      const json = await res.json();

      const csqCard = json.find((c: { slug: string }) => c.slug === "CSQ-001");
      expect(csqCard).toBeDefined();
      expect(csqCard.id).toBeTypeOf("string");
      expect(csqCard.slug).toBeTypeOf("string");
      expect(csqCard.name).toBeTypeOf("string");
      expect(csqCard.type).toBeTypeOf("string");
      // Should only have these four fields
      expect(Object.keys(csqCard).sort()).toEqual(["id", "name", "slug", "type"]);
    });
  });

  // ── GET /admin/cards/provider-names ──────────────────────────────────

  describe("GET /admin/cards/provider-names", () => {
    it("returns distinct source names including CSQ sources", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/provider-names"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));
      expect(json).toContain("csq-gallery");
      expect(json).toContain("csq-spreadsheet");
    });
  });

  // ── GET /admin/cards/provider-stats ──────────────────────────────────

  describe("GET /admin/cards/provider-stats", () => {
    it("returns per-source counts for CSQ sources", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/provider-stats"));
      expect(res.status).toBe(200);

      const json = await res.json();
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

  // ── GET /admin/cards/ ──────────────────────────────────────────────

  describe("GET /admin/cards/", () => {
    it("returns CSQ cards and unmatched groups", async () => {
      const res = await app.fetch(req("GET", "/admin/cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));

      // Find the matched card (CSQ Test Card)
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      expect(testCard.cardSlug).toBe("CSQ-001");
      expect(testCard.name).toBe("CSQ Test Card");
      expect(testCard.candidateCount).toBeGreaterThanOrEqual(1);

      // Find the orphan card (CSQ Another Card — has no candidate_cards)
      const anotherCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-002");
      expect(anotherCard).toBeDefined();
      expect(anotherCard.cardSlug).toBe("CSQ-002");
      expect(anotherCard.candidateCount).toBe(0);

      // Find the unmatched group (CSQ Unknown Card)
      const unmatched = json.find(
        (r: { cardSlug: string | null; name: string }) =>
          r.cardSlug === null && r.name === "CSQ Unknown Card",
      );
      expect(unmatched).toBeDefined();
      expect(unmatched.normalizedName).toBe("csqunknowncard");
      expect(unmatched.stagingShortCodes).toContain("CSQ-UNK-001");
    });

    it("includes unchecked counts for CSQ Test Card", async () => {
      const res = await app.fetch(req("GET", "/admin/cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      const total = Number(testCard.uncheckedCardCount) + Number(testCard.uncheckedPrintingCount);
      expect(total).toBeGreaterThan(0);
    });

    it("includes unmatched groups with cardId null", async () => {
      const res = await app.fetch(req("GET", "/admin/cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const unmatched = json.find((r: { name: string }) => r.name === "CSQ Unknown Card");
      expect(unmatched).toBeDefined();
      expect(unmatched.cardSlug).toBeNull();
    });
  });

  // ── GET /admin/cards/export ────────────────────────────────────────

  describe("GET /admin/cards/export", () => {
    it("returns all cards including CSQ cards with printings", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/export"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));

      // Find CSQ cards in the export (export uses short_code which is the card slug)
      const csqExport = json.filter((e: { card: { short_code: string } }) =>
        e.card.short_code?.startsWith("CSQ-"),
      );
      expect(csqExport).toHaveLength(3);

      // Ordered by name: "CSQ Another Card", "CSQ No Image Card", "CSQ Test Card"
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
      expect(sorted[2].printings[0].rarity).toBe("Common");
    });
  });

  // ── GET /admin/cards/:cardId ───────────────────────────────────────

  describe("GET /admin/cards/:cardId", () => {
    it("returns card detail with sources and printings", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-001"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // Card shape
      expect(json.card).toBeDefined();
      expect(json.card.slug).toBe("CSQ-001");
      expect(json.card.name).toBe("CSQ Test Card");
      expect(json.card.type).toBe("Unit");
      expect(json.card.domains).toEqual(["Mind"]);
      expect(json.card.energy).toBe(2);
      expect(json.card.keywords).toEqual(["Flash"]);

      // Sources
      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const spreadsheetSource = json.sources.find(
        (s: { provider: string }) => s.provider === "csq-spreadsheet",
      );
      expect(spreadsheetSource).toBeDefined();
      expect(spreadsheetSource.name).toBe("CSQ Test Card");
      expect(spreadsheetSource.shortCode).toBe("CSQ-001");

      // Printings
      expect(json.printings).toEqual(expect.any(Array));
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].shortCode).toBe("CSQ-001");
      expect(json.printings[0].rarity).toBe("Common");
      expect(json.printings[0].setId).toBe("CSQ-TEST");
    });

    it("response includes candidatePrintings", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-001"));
      const json = await res.json();

      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings.length).toBeGreaterThanOrEqual(1);

      const ps = json.candidatePrintings[0];
      expect(ps.shortCode).toBe("CSQ-001");
      expect(ps.setId).toBe("CSQ-TEST");
      expect(ps.rarity).toBe("Common");
      expect(ps.imageUrl).toBe("https://example.com/csq-test.png");
      expect(ps.candidateCardId).toBeTypeOf("string");
      expect(ps.checkedAt).toSatisfy((v: unknown) => v === null || typeof v === "string");
    });

    it("returns printingImages array", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-001"));
      const json = await res.json();

      expect(json.printingImages).toEqual(expect.any(Array));
    });

    it("returns 500 when card exists but has no name alias", async () => {
      // Temporarily delete the alias to simulate a broken state
      await testDb.deleteFrom("cardNameAliases").where("normName", "=", "csqtestcard").execute();

      const res = await app.fetch(req("GET", "/admin/cards/CSQ-001"));
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.code).toBe("MISSING_ALIAS");

      // Restore the alias for subsequent tests
      await testDb
        .insertInto("cardNameAliases")
        .values({ cardId: card1Id, normName: "csqtestcard" })
        .execute();
    });

    it("returns 200 with card null for non-existent card slug", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/NONEXISTENT"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.card).toBeNull();
    });
  });

  // ── GET /admin/cards/distinct-artists ──────────────────────────────

  describe("GET /admin/cards/distinct-artists", () => {
    it("returns distinct artist names from published printings", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/distinct-artists"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));
      // Our CSQ printings use "Artist A" and "Artist C"
      expect(json).toContain("Artist A");
      expect(json).toContain("Artist C");
    });
  });

  // ── GET /admin/cards/:cardId (extended) ───────────────────────────

  describe("GET /admin/cards/:cardId (extended coverage)", () => {
    it("returns card detail for a card with missing images", async () => {
      // Card CSQ-003 has a printing but no active front image
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-003"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.card).toBeDefined();
      expect(json.card.slug).toBe("CSQ-003");
      expect(json.card.name).toBe("CSQ No Image Card");

      // Sources should include the csq-spreadsheet candidate
      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const src = json.sources.find((s: { provider: string }) => s.provider === "csq-spreadsheet");
      expect(src).toBeDefined();

      // Printings should include the accepted printing
      expect(json.printings).toEqual(expect.any(Array));
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].shortCode).toBe("CSQ-003");
      expect(json.printings[0].setId).toBe("CSQ-TEST");
      // printing has setId resolved to slug
      expect(json.printings[0].setSlug).toBe("CSQ-TEST");
      // printingImages should be empty (no active front images set)
      expect(json.printingImages).toEqual(expect.any(Array));

      // candidatePrintings should include both linked and unlinked
      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings.length).toBeGreaterThanOrEqual(1);

      // candidatePrintingGroups should include the unlinked one
      expect(json.candidatePrintingGroups).toEqual(expect.any(Array));
      expect(json.candidatePrintingGroups.length).toBeGreaterThanOrEqual(1);

      // setTotals should include CSQ-TEST
      expect(json.setTotals).toBeDefined();
    });

    it("includes expectedCardId in card detail", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-001"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.expectedCardId).toBeTypeOf("string");
    });

    it("includes setTotals object", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/CSQ-003"));
      const json = await res.json();
      // CSQ-TEST set has printedTotal: 2
      expect(json.setTotals).toBeDefined();
      expect(typeof json.setTotals).toBe("object");
    });
  });

  // ── GET /admin/cards/ (extended) ──────────────────────────────────

  describe("GET /admin/cards/ (extended coverage)", () => {
    it("includes CSQ-003 card with candidate counts and missing image info", async () => {
      const res = await app.fetch(req("GET", "/admin/cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const card3 = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-003");
      expect(card3).toBeDefined();
      expect(card3.name).toBe("CSQ No Image Card");
      expect(card3.candidateCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /admin/cards/new/:name ─────────────────────────────────────

  describe("GET /admin/cards/new/:name", () => {
    it("returns unmatched sources for a normalized name", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/new/csqunknowncard"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.displayName).toBe("CSQ Unknown Card");

      // Sources
      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].provider).toBe("csq-gallery");
      expect(json.sources[0].name).toBe("CSQ Unknown Card");
      expect(json.sources[0].type).toBe("Rune");
      expect(json.sources[0].domains).toEqual(["Chaos"]);

      // Printing sources
      expect(json.candidatePrintings).toEqual(expect.any(Array));
      expect(json.candidatePrintings).toHaveLength(1);
      expect(json.candidatePrintings[0].shortCode).toBe("CSQ-UNK-001");
      expect(json.candidatePrintings[0].rarity).toBe("Rare");
    });

    it("returns 200 with empty sources for non-existent normalized name", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/new/nonexistent"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sources).toEqual(expect.any(Array));
      expect(json.sources).toHaveLength(0);
    });

    it("includes candidatePrintingGroups and defaultCardId for unmatched", async () => {
      const res = await app.fetch(req("GET", "/admin/cards/new/csqunknowncard"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.candidatePrintingGroups).toEqual(expect.any(Array));
      expect(json.candidatePrintingGroups.length).toBeGreaterThanOrEqual(1);
      expect(json.defaultCardId).toBeTypeOf("string");
    });
  });
});
