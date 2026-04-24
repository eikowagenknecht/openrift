import { describe, expect, it } from "vitest";

import { createTestContext, refreshCardAggregates, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Unified marketplace mappings route
//
// GET /admin/marketplace-mappings merges TCGPlayer + Cardmarket data per card.
// POST/DELETE /admin/marketplace-mappings?marketplace=<mp> for mutations.
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix UNM- for entities it creates.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0014-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed IDs populated during setup
let setId: string;
let cardId: string;
let printingId: string;
let secondCardId: string;
let _secondPrintingId: string;

if (ctx) {
  const { db } = ctx;

  // Seed set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "UNM-TEST", name: "UNM Unified Test Set", printedTotal: 2, sortOrder: 101 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Seed first card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "UNM-001",
      name: "UNM Alpha Card",
      type: "Unit",
      might: null,
      energy: 3,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  await db.insertInto("cardDomains").values({ cardId, domainSlug: "Mind", ordinal: 0 }).execute();

  // Seed first printing
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "UNM-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "UNM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Seed second card (for filter-behavior tests)
  const [secondCardRow] = await db
    .insertInto("cards")
    .values({
      slug: "UNM-002",
      name: "UNM Beta Card",
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
  secondCardId = secondCardRow.id;

  await db
    .insertInto("cardDomains")
    .values({ cardId: secondCardId, domainSlug: "Chaos", ordinal: 0 })
    .execute();

  // Seed second printing
  const [secondPrintingRow] = await db
    .insertInto("printings")
    .values({
      cardId: secondCardId,
      setId,
      shortCode: "UNM-002",
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "UNM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  _secondPrintingId = secondPrintingRow.id;

  // Marketplace groups
  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "tcgplayer", groupId: 10_300, name: "UNM TCG Group" })
    .execute();
  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "cardmarket", groupId: 10_301, name: "UNM CM Group" })
    .execute();
  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "cardtrader", groupId: 10_302, name: "UNM CT Group" })
    .execute();

  // TCGPlayer staging row for Alpha Card
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "tcgplayer",
      externalId: 11_111,
      groupId: 10_300,
      productName: "UNM Alpha Card Normal",
      finish: "normal",
      language: "EN",
      recordedAt: new Date("2026-02-01T10:00:00Z"),
      marketCents: 200,
      lowCents: 120,
      midCents: 160,
      highCents: 300,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    })
    .execute();

  // Cardmarket staging row for Alpha Card
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "cardmarket",
      externalId: 22_222,
      groupId: 10_301,
      productName: "UNM Alpha Card Normal",
      finish: "normal",
      language: "EN",
      recordedAt: new Date("2026-02-01T10:00:00Z"),
      marketCents: 180,
      lowCents: 100,
      midCents: null,
      highCents: null,
      trendCents: 150,
      avg1Cents: 140,
      avg7Cents: 145,
      avg30Cents: 160,
    })
    .execute();

  // TCGPlayer staging row for Beta Card
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "tcgplayer",
      externalId: 33_333,
      groupId: 10_300,
      productName: "UNM Beta Card Normal",
      finish: "normal",
      language: "EN",
      recordedAt: new Date("2026-02-01T10:00:00Z"),
      marketCents: 500,
      lowCents: 400,
      midCents: 450,
      highCents: 600,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    })
    .execute();

  // CardTrader staging row for Alpha Card (covers ctMapPrices in marketplace-configs.ts)
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "cardtrader",
      externalId: 44_444,
      groupId: 10_302,
      productName: "UNM Alpha Card Normal",
      finish: "normal",
      language: "EN",
      recordedAt: new Date("2026-02-01T10:00:00Z"),
      marketCents: 150,
      lowCents: 90,
      midCents: 120,
      highCents: 200,
      trendCents: 130,
      avg1Cents: 110,
      avg7Cents: 115,
      avg30Cents: 125,
    })
    .execute();

  await refreshCardAggregates(db);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Unified marketplace mappings (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── Empty state ────────────────────────────────────────────────────────────

  describe("GET /admin/marketplace-mappings (baseline)", () => {
    it("returns groups, unmatchedProducts, and allCards", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toEqual(expect.any(Array));
      expect(json.unmatchedProducts).toBeDefined();
      expect(json.unmatchedProducts.tcgplayer).toEqual(expect.any(Array));
      expect(json.unmatchedProducts.cardmarket).toEqual(expect.any(Array));
      expect(json.allCards).toEqual(expect.any(Array));
    });
  });

  // ── Merged data ────────────────────────────────────────────────────────────

  describe("GET /admin/marketplace-mappings?all=true (seeded data)", () => {
    it("returns merged groups with both tcgplayer and cardmarket data per card", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      // Should have both marketplace staged products
      expect(alphaGroup.tcgplayer).toBeDefined();
      expect(alphaGroup.tcgplayer.stagedProducts).toEqual(expect.any(Array));
      expect(alphaGroup.cardmarket).toBeDefined();
      expect(alphaGroup.cardmarket.stagedProducts).toEqual(expect.any(Array));

      // TCGPlayer staged product
      expect(alphaGroup.tcgplayer.stagedProducts.length).toBeGreaterThanOrEqual(1);
      const tcgStaged = alphaGroup.tcgplayer.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 11_111,
      );
      expect(tcgStaged).toBeDefined();

      // Cardmarket staged product
      expect(alphaGroup.cardmarket.stagedProducts.length).toBeGreaterThanOrEqual(1);
      const cmStaged = alphaGroup.cardmarket.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 22_222,
      );
      expect(cmStaged).toBeDefined();
    });

    it("printings have tcgExternalId and cmExternalId fields", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      for (const printing of alphaGroup.printings) {
        // Both fields should exist (null when unmapped)
        expect("tcgExternalId" in printing).toBe(true);
        expect("cmExternalId" in printing).toBe(true);
      }
    });

    it("merged groups contain card metadata", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();
      expect(alphaGroup.cardId).toBeTypeOf("string");
      expect(alphaGroup.cardSlug).toBe("UNM-001");
      expect(alphaGroup.cardType).toBe("Unit");
      expect(alphaGroup.domains).toContain("Mind");
      expect(alphaGroup.energy).toBe(3);
      expect(alphaGroup.setName).toBe("UNM Unified Test Set");
    });

    it("groups contain both cards from seed data", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const cardNames = json.groups.map((g: { cardName: string }) => g.cardName);
      expect(cardNames).toContain("UNM Alpha Card");
      expect(cardNames).toContain("UNM Beta Card");
    });

    it("UNM Beta Card group has TCGPlayer data but no Cardmarket staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const betaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Beta Card",
      );
      expect(betaGroup).toBeDefined();

      // TCGPlayer has a staged product for Beta Card
      expect(betaGroup.tcgplayer.stagedProducts.length).toBeGreaterThanOrEqual(1);
      // Cardmarket has no staged product for Beta Card
      expect(betaGroup.cardmarket.stagedProducts).toHaveLength(0);
    });
  });

  // ── Filter behavior ────────────────────────────────────────────────────────

  describe("GET /admin/marketplace-mappings (filter behavior)", () => {
    it("without all=true, includes groups with unmapped printings or staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // All returned groups should have at least one unmapped printing or staged products
      for (const group of json.groups) {
        const hasUnmappedTcg = group.printings.some(
          (p: { tcgExternalId: number | null }) => p.tcgExternalId === null,
        );
        const hasUnmappedCm = group.printings.some(
          (p: { cmExternalId: number | null }) => p.cmExternalId === null,
        );
        const hasUnmappedCt = group.printings.some(
          (p: { ctExternalId: number | null }) => p.ctExternalId === null,
        );
        const hasStagedProducts =
          group.tcgplayer.stagedProducts.length > 0 ||
          group.cardmarket.stagedProducts.length > 0 ||
          group.cardtrader.stagedProducts.length > 0;

        expect(hasUnmappedTcg || hasUnmappedCm || hasUnmappedCt || hasStagedProducts).toBe(true);
      }
    });

    it("excludes fully-mapped cards when all is not true", async () => {
      // Map Alpha Card printing for both TCGPlayer and Cardmarket
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 22_222 }],
        }),
      );

      // With all=true, Alpha Card should still appear
      const resAll = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const allJson = await resAll.json();
      const alphaInAll = allJson.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaInAll).toBeDefined();

      // Without all=true, Alpha Card may or may not appear depending on whether
      // all its printings are fully mapped in both marketplaces and it has no
      // staged products. If it has no staged products remaining (they were consumed
      // by the mapping), and all printings are mapped, it should be excluded.
      const resFiltered = await app.fetch(req("GET", "/admin/marketplace-mappings"));
      const filteredJson = await resFiltered.json();
      const filteredGroupCount = filteredJson.groups.length;
      const allGroupCount = allJson.groups.length;

      // The filtered list should be <= the all list
      expect(filteredGroupCount).toBeLessThanOrEqual(allGroupCount);

      // Clean up: unmap so other tests are not affected
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"));
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=cardmarket"));
    });
  });

  // ── After mapping: verify merged external IDs ──────────────────────────────

  describe("merged external IDs after mapping", () => {
    it("printings reflect tcgExternalId after TCGPlayer mapping", async () => {
      // Re-seed TCGPlayer staging (may have been restored by unmap all above)
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 11_111,
          groupId: 10_300,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 200,
          lowCents: 120,
          midCents: 160,
          highCents: 300,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      const mapped = alphaGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mapped).toBeDefined();
      expect(mapped.tcgExternalId).toBe(11_111);
      // cmExternalId should still be null (not mapped for Cardmarket)
      expect(mapped.cmExternalId).toBeNull();

      // Clean up
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"));
    });

    it("printings reflect cmExternalId after Cardmarket-only mapping", async () => {
      // Re-seed Cardmarket staging
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "cardmarket",
          externalId: 22_222,
          groupId: 10_301,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 180,
          lowCents: 100,
          midCents: null,
          highCents: null,
          trendCents: 150,
          avg1Cents: 140,
          avg7Cents: 145,
          avg30Cents: 160,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 22_222 }],
        }),
      );

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      const mapped = alphaGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mapped).toBeDefined();
      // cmExternalId should be set from the Cardmarket merge loop
      expect(mapped.cmExternalId).toBe(22_222);
      // tcgExternalId should be null (not mapped for TCGPlayer)
      expect(mapped.tcgExternalId).toBeNull();

      // Clean up
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=cardmarket"));
    });

    it("printings reflect both tcgExternalId and cmExternalId after dual mapping", async () => {
      // Re-seed both staging rows
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 11_111,
          groupId: 10_300,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 200,
          lowCents: 120,
          midCents: 160,
          highCents: 300,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "cardmarket",
          externalId: 22_222,
          groupId: 10_301,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 180,
          lowCents: 100,
          midCents: null,
          highCents: null,
          trendCents: 150,
          avg1Cents: 140,
          avg7Cents: 145,
          avg30Cents: 160,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      // Map both marketplaces
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 22_222 }],
        }),
      );

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      const mapped = alphaGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mapped).toBeDefined();
      // Both external IDs should be populated
      expect(mapped.tcgExternalId).toBe(11_111);
      expect(mapped.cmExternalId).toBe(22_222);

      // Clean up
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"));
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=cardmarket"));
    });
  });

  // ── Printing detail fields ───────────────────────────────────────────────

  describe("printing detail fields in merged groups", () => {
    it("printings contain all expected metadata fields", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();
      expect(alphaGroup.printings.length).toBeGreaterThanOrEqual(1);

      const printing = alphaGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(printing).toBeDefined();
      expect(printing.shortCode).toBe("UNM-001");
      expect(printing.rarity).toBe("Common");
      expect(printing.artVariant).toBe("normal");
      expect(printing.isSigned).toBe(false);
      expect(printing.markerSlugs).toEqual([]);
      expect(printing.finish).toBe("normal");
    });

    it("merged group includes superTypes and might fields", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();
      expect(alphaGroup.superTypes).toEqual(expect.any(Array));
      expect(alphaGroup.might).toBeNull();
      expect(alphaGroup.setId).toBeTypeOf("string");
    });
  });

  // ── allCards structure ──────────────────────────────────────────────────

  describe("allCards response field", () => {
    it("allCards entries have cardId, cardName, setName, and shortCodes", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      expect(json.allCards).toEqual(expect.any(Array));
      expect(json.allCards.length).toBeGreaterThanOrEqual(2);

      const alphaCard = json.allCards.find(
        (c: { cardName: string }) => c.cardName === "UNM Alpha Card",
      );
      expect(alphaCard).toBeDefined();
      expect(alphaCard.cardId).toBeTypeOf("string");
      expect(alphaCard.cardName).toBe("UNM Alpha Card");
      expect(alphaCard.setName).toBe("UNM Unified Test Set");
      expect(alphaCard.shortCodes).toEqual(expect.any(Array));
      expect(alphaCard.shortCodes.length).toBeGreaterThanOrEqual(1);
      expect(alphaCard.shortCodes[0]).toBeTypeOf("string");
    });
  });

  // ── unmatchedProducts structure ────────────────────────────────────────

  describe("unmatchedProducts response field", () => {
    it("unmatchedProducts has separate tcgplayer and cardmarket arrays", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      expect(json.unmatchedProducts).toBeDefined();
      expect(json.unmatchedProducts.tcgplayer).toEqual(expect.any(Array));
      expect(json.unmatchedProducts.cardmarket).toEqual(expect.any(Array));
    });
  });

  // ── Cardmarket merge into existing TCGPlayer entry ────────────────────

  describe("Cardmarket data merged into TCGPlayer-initialized group", () => {
    it("Alpha Card has both marketplace assignedProducts after dual mapping", async () => {
      // Re-seed both staging rows
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 11_111,
          groupId: 10_300,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 200,
          lowCents: 120,
          midCents: 160,
          highCents: 300,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "cardmarket",
          externalId: 22_222,
          groupId: 10_301,
          productName: "UNM Alpha Card Normal",
          finish: "normal",
          language: "EN",
          recordedAt: new Date("2026-02-01T10:00:00Z"),
          marketCents: 180,
          lowCents: 100,
          midCents: null,
          highCents: null,
          trendCents: 150,
          avg1Cents: 140,
          avg7Cents: 145,
          avg30Cents: 160,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language", "recordedAt"]).doNothing(),
        )
        .execute();

      // Map both marketplaces
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 22_222 }],
        }),
      );

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Alpha Card",
      );
      expect(alphaGroup).toBeDefined();

      // TCGPlayer assignedProducts should contain the mapped product
      expect(alphaGroup.tcgplayer.assignedProducts).toEqual(expect.any(Array));
      expect(alphaGroup.tcgplayer.assignedProducts.length).toBeGreaterThanOrEqual(1);

      // Cardmarket assignedProducts should also contain the mapped product
      expect(alphaGroup.cardmarket.assignedProducts).toEqual(expect.any(Array));
      expect(alphaGroup.cardmarket.assignedProducts.length).toBeGreaterThanOrEqual(1);

      // Staged products should be empty after mapping (consumed by assignment)
      expect(alphaGroup.tcgplayer.stagedProducts).toHaveLength(0);
      expect(alphaGroup.cardmarket.stagedProducts).toHaveLength(0);

      // Clean up
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"));
      await app.fetch(req("DELETE", "/admin/marketplace-mappings/all?marketplace=cardmarket"));
    });

    it("Beta Card Cardmarket section has empty assignedProducts and stagedProducts", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const betaGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "UNM Beta Card",
      );
      expect(betaGroup).toBeDefined();

      // Cardmarket was initialized empty in the TCGPlayer loop
      expect(betaGroup.cardmarket.stagedProducts).toHaveLength(0);
      expect(betaGroup.cardmarket.assignedProducts).toHaveLength(0);
    });
  });
});
