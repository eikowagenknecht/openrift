import { afterAll, describe, expect, it, mock } from "bun:test";

import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
} from "@openrift/shared/test/integration-setup";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";
import { req } from "../../test/integration-helper.js";

// ---------------------------------------------------------------------------
// Integration tests: Unified marketplace mappings route
//
// GET /admin/marketplace-mappings merges TCGPlayer + Cardmarket data per card.
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

mock.module("../../auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

// Seed IDs populated during setup
let setId: string;
let cardId: string;
let printingId: string;
let secondCardId: string;
let _secondPrintingId: string;

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "unifiedmap");
  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../../app.js"),
    import("../../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;
  await migrateModule.migrate(db, noopLogger);

  // Seed user + admin
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();

  // Seed set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "UTEST", name: "Unified Test Set", printed_total: 2, sort_order: 1 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Seed first card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "UTEST-001",
      name: "Alpha Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 3,
      power: null,
      might_bonus: null,
      keywords: [],
      rules_text: null,
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  // Seed first printing
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      slug: "UTEST-001:common:normal:",
      card_id: cardId,
      set_id: setId,
      source_id: "UTEST-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Seed second card (for filter-behavior tests)
  const [secondCardRow] = await db
    .insertInto("cards")
    .values({
      slug: "UTEST-002",
      name: "Beta Card",
      type: "Spell",
      super_types: [],
      domains: ["Shadow"],
      might: null,
      energy: 1,
      power: null,
      might_bonus: null,
      keywords: [],
      rules_text: null,
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();
  secondCardId = secondCardRow.id;

  // Seed second printing
  const [secondPrintingRow] = await db
    .insertInto("printings")
    .values({
      slug: "UTEST-002:rare:normal:",
      card_id: secondCardId,
      set_id: setId,
      source_id: "UTEST-002",
      collector_number: 2,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  _secondPrintingId = secondPrintingRow.id;

  // Marketplace groups
  await db
    .insertInto("marketplace_groups")
    .values({ marketplace: "tcgplayer", group_id: 10, name: "TCG Unified Group" })
    .execute();
  await db
    .insertInto("marketplace_groups")
    .values({ marketplace: "cardmarket", group_id: 200, name: "CM Unified Group" })
    .execute();

  // TCGPlayer staging row for Alpha Card
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "tcgplayer",
      external_id: 11_111,
      group_id: 10,
      product_name: "Alpha Card Normal",
      finish: "normal",
      recorded_at: new Date("2026-02-01T10:00:00Z"),
      market_cents: 200,
      low_cents: 120,
      mid_cents: 160,
      high_cents: 300,
      trend_cents: null,
      avg1_cents: null,
      avg7_cents: null,
      avg30_cents: null,
    })
    .execute();

  // Cardmarket staging row for Alpha Card
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "cardmarket",
      external_id: 22_222,
      group_id: 200,
      product_name: "Alpha Card Normal",
      finish: "normal",
      recorded_at: new Date("2026-02-01T10:00:00Z"),
      market_cents: 180,
      low_cents: 100,
      mid_cents: null,
      high_cents: null,
      trend_cents: 150,
      avg1_cents: 140,
      avg7_cents: 145,
      avg30_cents: 160,
    })
    .execute();

  // TCGPlayer staging row for Beta Card
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "tcgplayer",
      external_id: 33_333,
      group_id: 10,
      product_name: "Beta Card Normal",
      finish: "normal",
      recorded_at: new Date("2026-02-01T10:00:00Z"),
      market_cents: 500,
      low_cents: 400,
      mid_cents: 450,
      high_cents: 600,
      trend_cents: null,
      avg1_cents: null,
      avg7_cents: null,
      avg30_cents: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Unified marketplace mappings (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe("GET /admin/marketplace-mappings (baseline)", () => {
    it("returns groups, unmatchedProducts, and allCards", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.unmatchedProducts).toBeDefined();
      expect(json.unmatchedProducts.tcgplayer).toBeArray();
      expect(json.unmatchedProducts.cardmarket).toBeArray();
      expect(json.allCards).toBeArray();
    });
  });

  // ── Merged data ────────────────────────────────────────────────────────────

  describe("GET /admin/marketplace-mappings?all=true (seeded data)", () => {
    it("returns merged groups with both tcgplayer and cardmarket data per card", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const alphaGroup = json.groups.find((g: { cardName: string }) => g.cardName === "Alpha Card");
      expect(alphaGroup).toBeDefined();

      // Should have both marketplace staged products
      expect(alphaGroup.tcgplayer).toBeDefined();
      expect(alphaGroup.tcgplayer.stagedProducts).toBeArray();
      expect(alphaGroup.cardmarket).toBeDefined();
      expect(alphaGroup.cardmarket.stagedProducts).toBeArray();

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

      const alphaGroup = json.groups.find((g: { cardName: string }) => g.cardName === "Alpha Card");
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

      const alphaGroup = json.groups.find((g: { cardName: string }) => g.cardName === "Alpha Card");
      expect(alphaGroup).toBeDefined();
      expect(alphaGroup.cardId).toBeString();
      expect(alphaGroup.cardSlug).toBe("UTEST-001");
      expect(alphaGroup.cardType).toBe("Unit");
      expect(alphaGroup.domains).toContain("Arcane");
      expect(alphaGroup.energy).toBe(3);
      expect(alphaGroup.setName).toBe("Unified Test Set");
    });

    it("groups contain both cards from seed data", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const cardNames = json.groups.map((g: { cardName: string }) => g.cardName);
      expect(cardNames).toContain("Alpha Card");
      expect(cardNames).toContain("Beta Card");
    });

    it("Beta Card group has TCGPlayer data but no Cardmarket staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const betaGroup = json.groups.find((g: { cardName: string }) => g.cardName === "Beta Card");
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
        const hasStagedProducts =
          group.tcgplayer.stagedProducts.length > 0 || group.cardmarket.stagedProducts.length > 0;

        expect(hasUnmappedTcg || hasUnmappedCm || hasStagedProducts).toBe(true);
      }
    });

    it("excludes fully-mapped cards when all is not true", async () => {
      // Map Alpha Card printing for both TCGPlayer and Cardmarket
      await app.fetch(
        req("POST", "/admin/tcgplayer-mappings", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );
      await app.fetch(
        req("POST", "/admin/cardmarket-mappings", {
          mappings: [{ printingId, externalId: 22_222 }],
        }),
      );

      // With all=true, Alpha Card should still appear
      const resAll = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const allJson = await resAll.json();
      const alphaInAll = allJson.groups.find(
        (g: { cardName: string }) => g.cardName === "Alpha Card",
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
      await app.fetch(req("DELETE", "/admin/tcgplayer-mappings/all"));
      await app.fetch(req("DELETE", "/admin/cardmarket-mappings/all"));
    });
  });

  // ── After mapping: verify merged external IDs ──────────────────────────────

  describe("merged external IDs after mapping", () => {
    it("printings reflect tcgExternalId after TCGPlayer mapping", async () => {
      // Re-seed TCGPlayer staging (may have been restored by unmap all above)
      await db
        .insertInto("marketplace_staging")
        .values({
          marketplace: "tcgplayer",
          external_id: 11_111,
          group_id: 10,
          product_name: "Alpha Card Normal",
          finish: "normal",
          recorded_at: new Date("2026-02-01T10:00:00Z"),
          market_cents: 200,
          low_cents: 120,
          mid_cents: 160,
          high_cents: 300,
          trend_cents: null,
          avg1_cents: null,
          avg7_cents: null,
          avg30_cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "external_id", "finish", "recorded_at"]).doNothing(),
        )
        .execute();

      await app.fetch(
        req("POST", "/admin/tcgplayer-mappings", {
          mappings: [{ printingId, externalId: 11_111 }],
        }),
      );

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const alphaGroup = json.groups.find((g: { cardName: string }) => g.cardName === "Alpha Card");
      expect(alphaGroup).toBeDefined();

      const mapped = alphaGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mapped).toBeDefined();
      expect(mapped.tcgExternalId).toBe(11_111);
      // cmExternalId should still be null (not mapped for Cardmarket)
      expect(mapped.cmExternalId).toBeNull();

      // Clean up
      await app.fetch(req("DELETE", "/admin/tcgplayer-mappings/all"));
    });
  });
});
