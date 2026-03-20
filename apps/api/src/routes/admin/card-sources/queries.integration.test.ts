import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources query routes (/admin/card-sources/*)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CSQ- for entities it creates.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0017-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Track IDs assigned by the DB for assertions
let card1Id: string;
let card2Id: string;
let setId: string;
let printing1Id: string;
let cs1Id: string;
let cs2Id: string;

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
  card1Id = card1.id;

  const [card2] = await db
    .insertInto("cards")
    .values({
      slug: "CSQ-002",
      name: "CSQ Another Card",
      type: "Spell",
      superTypes: [],
      domains: ["Calm"],
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
  card2Id = card2.id;

  // Create printings
  const [printing1] = await db
    .insertInto("printings")
    .values({
      slug: "CSQ-001:common:normal:",
      cardId: card1Id,
      setId: setId,
      shortCode: "CSQ-001",
      collectorNumber: 1,
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

  // Create printing sources (matched)
  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs1Id,
      printingId: printing1Id,
      shortCode: "CSQ-001",
      setId: "CSQ-TEST",
      setName: "CSQ Test Set",
      collectorNumber: 1,
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
      collectorNumber: 99,
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Card-sources query routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // ── GET /admin/card-sources/all-cards ─────────────────────────────────────

  describe("GET /admin/card-sources/all-cards", () => {
    it("returns all cards including CSQ cards", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/all-cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();

      // Our CSQ cards should be present
      const csqCards = json.filter((c: { slug: string }) => c.slug.startsWith("CSQ-"));
      expect(csqCards).toHaveLength(2);

      // Ordered by name: "CSQ Another Card" before "CSQ Test Card"
      const sorted = csqCards.sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      );
      expect(sorted[0].name).toBe("CSQ Another Card");
      expect(sorted[1].name).toBe("CSQ Test Card");
    });

    it("returns correct shape (id, slug, name, type)", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/all-cards"));
      const json = await res.json();

      const csqCard = json.find((c: { slug: string }) => c.slug === "CSQ-001");
      expect(csqCard).toBeDefined();
      expect(csqCard.id).toBeString();
      expect(csqCard.slug).toBeString();
      expect(csqCard.name).toBeString();
      expect(csqCard.type).toBeString();
      // Should only have these four fields
      expect(Object.keys(csqCard).sort()).toEqual(["id", "name", "slug", "type"]);
    });
  });

  // ── GET /admin/card-sources/source-names ──────────────────────────────────

  describe("GET /admin/card-sources/source-names", () => {
    it("returns distinct source names including CSQ sources", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/source-names"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      expect(json).toContain("csq-gallery");
      expect(json).toContain("csq-spreadsheet");
    });
  });

  // ── GET /admin/card-sources/source-stats ──────────────────────────────────

  describe("GET /admin/card-sources/source-stats", () => {
    it("returns per-source counts for CSQ sources", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/source-stats"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();

      const gallery = json.find((s: { provider: string }) => s.provider === "csq-gallery");
      expect(gallery).toBeDefined();
      expect(gallery.cardCount).toBe(1);
      expect(gallery.printingCount).toBe(1);
      expect(gallery.lastUpdated).toBeString();

      const spreadsheet = json.find((s: { provider: string }) => s.provider === "csq-spreadsheet");
      expect(spreadsheet).toBeDefined();
      expect(spreadsheet.cardCount).toBe(1);
      expect(spreadsheet.printingCount).toBe(1);
    });
  });

  // ── GET /admin/card-sources/ ──────────────────────────────────────────────

  describe("GET /admin/card-sources/", () => {
    it("returns CSQ cards and unmatched groups", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();

      // Find the matched card (CSQ Test Card)
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      expect(testCard.cardId).toBe(card1Id);
      expect(testCard.name).toBe("CSQ Test Card");
      expect(testCard.candidateCount).toBeGreaterThanOrEqual(1);

      // Find the orphan card (CSQ Another Card — has no card_sources)
      const anotherCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-002");
      expect(anotherCard).toBeDefined();
      expect(anotherCard.cardId).toBe(card2Id);
      expect(anotherCard.candidateCount).toBe(0);

      // Find the unmatched group (CSQ Unknown Card)
      const unmatched = json.find(
        (r: { cardId: string | null; name: string }) =>
          r.cardId === null && r.name === "CSQ Unknown Card",
      );
      expect(unmatched).toBeDefined();
      expect(unmatched.normalizedName).toBe("csqunknowncard");
      expect(unmatched.pendingSourceIds).toContain("CSQ-UNK-001");
    });

    it("includes unchecked counts for CSQ Test Card", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CSQ-001");
      expect(testCard).toBeDefined();
      const total = Number(testCard.uncheckedCardCount) + Number(testCard.uncheckedPrintingCount);
      expect(total).toBeGreaterThan(0);
    });

    it("includes unmatched groups with cardId null", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const unmatched = json.find((r: { name: string }) => r.name === "CSQ Unknown Card");
      expect(unmatched).toBeDefined();
      expect(unmatched.cardId).toBeNull();
    });
  });

  // ── GET /admin/card-sources/export ────────────────────────────────────────

  describe("GET /admin/card-sources/export", () => {
    it("returns all cards including CSQ cards with printings", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/export"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();

      // Find CSQ cards in the export (export uses source_id which is the card slug)
      const csqExport = json.filter((e: { card: { source_id: string } }) =>
        e.card.source_id?.startsWith("CSQ-"),
      );
      expect(csqExport).toHaveLength(2);

      // Ordered by name: "CSQ Another Card" first, "CSQ Test Card" second
      const sorted = csqExport.sort(
        (a: { card: { name: string } }, b: { card: { name: string } }) =>
          a.card.name.localeCompare(b.card.name),
      );
      expect(sorted[0].card.name).toBe("CSQ Another Card");
      expect(sorted[0].printings).toBeArray();
      expect(sorted[0].printings).toHaveLength(0);

      expect(sorted[1].card.name).toBe("CSQ Test Card");
      expect(sorted[1].printings).toBeArray();
      expect(sorted[1].printings).toHaveLength(1);
      expect(sorted[1].printings[0].source_id).toBe("CSQ-001");
      expect(sorted[1].printings[0].set_id).toBe("CSQ-TEST");
      expect(sorted[1].printings[0].rarity).toBe("Common");
    });
  });

  // ── GET /admin/card-sources/:cardId ───────────────────────────────────────

  describe("GET /admin/card-sources/:cardId", () => {
    it("returns card detail with sources and printings", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/CSQ-001"));
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
      expect(json.card.rulesText).toBe("Flash");

      // Sources
      expect(json.sources).toBeArray();
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const spreadsheetSource = json.sources.find(
        (s: { source: string }) => s.source === "csq-spreadsheet",
      );
      expect(spreadsheetSource).toBeDefined();
      expect(spreadsheetSource.name).toBe("CSQ Test Card");
      expect(spreadsheetSource.shortCode).toBe("CSQ-001");

      // Printings
      expect(json.printings).toBeArray();
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].shortCode).toBe("CSQ-001");
      expect(json.printings[0].rarity).toBe("Common");
      expect(json.printings[0].setId).toBe("CSQ-TEST");
    });

    it("response includes candidatePrintings", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/CSQ-001"));
      const json = await res.json();

      expect(json.candidatePrintings).toBeArray();
      expect(json.candidatePrintings.length).toBeGreaterThanOrEqual(1);

      const ps = json.candidatePrintings[0];
      expect(ps.shortCode).toBe("CSQ-001");
      expect(ps.setId).toBe("CSQ-TEST");
      expect(ps.rarity).toBe("Common");
      expect(ps.imageUrl).toBe("https://example.com/csq-test.png");
      expect(ps.candidateCardId).toBeString();
      expect(ps.createdAt).toBeString();
      expect(ps.updatedAt).toBeString();
    });

    it("returns printingImages array", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/CSQ-001"));
      const json = await res.json();

      expect(json.printingImages).toBeArray();
    });

    it("returns 404 for non-existent card slug", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/NONEXISTENT"));
      expect(res.status).toBe(404);
    });
  });

  // ── GET /admin/card-sources/new/:name ─────────────────────────────────────

  describe("GET /admin/card-sources/new/:name", () => {
    it("returns unmatched sources for a normalized name", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/new/csqunknowncard"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.name).toBe("CSQ Unknown Card");

      // Sources
      expect(json.sources).toBeArray();
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].source).toBe("csq-gallery");
      expect(json.sources[0].name).toBe("CSQ Unknown Card");
      expect(json.sources[0].type).toBe("Rune");
      expect(json.sources[0].domains).toEqual(["Chaos"]);

      // Printing sources
      expect(json.candidatePrintings).toBeArray();
      expect(json.candidatePrintings).toHaveLength(1);
      expect(json.candidatePrintings[0].shortCode).toBe("CSQ-UNK-001");
      expect(json.candidatePrintings[0].rarity).toBe("Rare");
      expect(json.candidatePrintings[0].collectorNumber).toBe(99);
    });

    it("returns 404 for non-existent normalized name", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/new/nonexistent"));
      expect(res.status).toBe(404);
    });
  });
});
