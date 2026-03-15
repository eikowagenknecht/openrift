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
// Integration tests: Card-sources query routes (/admin/card-sources/*)
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
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

// Track IDs assigned by the DB for assertions
let card1Id: string;
let card2Id: string;
let setId: string;
let printing1Id: string;
let cs1Id: string;
let cs2Id: string;

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "card_sources_queries");
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

  // ── Seed data ──────────────────────────────────────────────────────────────

  // Create a set
  const [set] = await db
    .insertInto("sets")
    .values({ slug: "TEST", name: "Test Set", printed_total: 2, sort_order: 1 })
    .returning("id")
    .execute();
  setId = set.id;

  // Create cards
  const [card1] = await db
    .insertInto("cards")
    .values({
      slug: "TEST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      keywords: ["Flash"],
      rules_text: "Flash",
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();
  card1Id = card1.id;

  const [card2] = await db
    .insertInto("cards")
    .values({
      slug: "TEST-002",
      name: "Another Card",
      type: "Spell",
      super_types: [],
      domains: ["Nature"],
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
  card2Id = card2.id;

  // Create printings
  const [printing1] = await db
    .insertInto("printings")
    .values({
      slug: "TEST-001:common:normal:",
      card_id: card1Id,
      set_id: setId,
      source_id: "TEST-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Artist A",
      public_code: "TST",
      printed_rules_text: "Flash",
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printing1Id = printing1.id;

  // Create card sources (matched — name matches card1 via norm_name trigger)
  const [cs1] = await db
    .insertInto("card_sources")
    .values({
      source: "spreadsheet",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      rules_text: "Flash",
      effect_text: null,
      tags: [],
      source_id: "TEST-001",
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  cs1Id = cs1.id;

  // Create card source (unmatched — no card with this name)
  const [cs2] = await db
    .insertInto("card_sources")
    .values({
      source: "gallery",
      name: "Unknown Card",
      type: "Rune",
      super_types: [],
      domains: ["Shadow"],
      might: null,
      energy: 3,
      power: null,
      might_bonus: null,
      rules_text: null,
      effect_text: null,
      tags: [],
      source_id: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  cs2Id = cs2.id;

  // Create printing sources (matched)
  await db
    .insertInto("printing_sources")
    .values({
      card_source_id: cs1Id,
      printing_id: printing1Id,
      source_id: "TEST-001",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Artist A",
      public_code: "TST",
      printed_rules_text: "Flash",
      printed_effect_text: null,
      image_url: "https://example.com/test.png",
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .execute();

  // Printing source for unmatched card
  await db
    .insertInto("printing_sources")
    .values({
      card_source_id: cs2Id,
      printing_id: null,
      source_id: "UNK-001",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 99,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      image_url: null,
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Card-sources query routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── GET /admin/card-sources/all-cards ─────────────────────────────────────

  describe("GET /admin/card-sources/all-cards", () => {
    it("returns all cards ordered by name", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/all-cards"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      expect(json).toHaveLength(2);
      // Ordered by name: "Another Card" before "Test Card"
      expect(json[0].name).toBe("Another Card");
      expect(json[1].name).toBe("Test Card");
    });

    it("returns correct shape (id, slug, name, type)", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/all-cards"));
      const json = await res.json();

      for (const card of json) {
        expect(card.id).toBeString();
        expect(card.slug).toBeString();
        expect(card.name).toBeString();
        expect(card.type).toBeString();
        // Should only have these four fields
        expect(Object.keys(card).sort()).toEqual(["id", "name", "slug", "type"]);
      }
    });
  });

  // ── GET /admin/card-sources/source-names ──────────────────────────────────

  describe("GET /admin/card-sources/source-names", () => {
    it("returns distinct source names", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/source-names"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      expect(json).toContain("gallery");
      expect(json).toContain("spreadsheet");
      expect(json).toHaveLength(2);
    });
  });

  // ── GET /admin/card-sources/source-stats ──────────────────────────────────

  describe("GET /admin/card-sources/source-stats", () => {
    it("returns per-source counts", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/source-stats"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      expect(json).toHaveLength(2);

      const gallery = json.find((s: { source: string }) => s.source === "gallery");
      expect(gallery).toBeDefined();
      expect(gallery.cardCount).toBe(1);
      expect(gallery.printingCount).toBe(1);
      expect(gallery.lastUpdated).toBeString();

      const spreadsheet = json.find((s: { source: string }) => s.source === "spreadsheet");
      expect(spreadsheet).toBeDefined();
      expect(spreadsheet.cardCount).toBe(1);
      expect(spreadsheet.printingCount).toBe(1);
    });
  });

  // ── GET /admin/card-sources/ ──────────────────────────────────────────────

  describe("GET /admin/card-sources/", () => {
    it("returns all cards and unmatched groups", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      // card1 (matched via source), card2 (orphan, no sources), unmatched "Unknown Card"
      expect(json.length).toBeGreaterThanOrEqual(3);

      // Find the matched card (Test Card)
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "TEST-001");
      expect(testCard).toBeDefined();
      expect(testCard.cardId).toBe(card1Id);
      expect(testCard.name).toBe("Test Card");
      expect(testCard.sourceCount).toBeGreaterThanOrEqual(1);

      // Find the orphan card (Another Card — has no card_sources)
      const anotherCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "TEST-002");
      expect(anotherCard).toBeDefined();
      expect(anotherCard.cardId).toBe(card2Id);
      expect(anotherCard.sourceCount).toBe(0);

      // Find the unmatched group (Unknown Card)
      const unmatched = json.find(
        (r: { cardId: string | null; name: string }) =>
          r.cardId === null && r.name === "Unknown Card",
      );
      expect(unmatched).toBeDefined();
      expect(unmatched.normalizedName).toBe("unknowncard");
      expect(unmatched.pendingSourceIds).toContain("UNK-001");
    });

    it("filter=unchecked returns items with unchecked sources plus orphan cards", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources?filter=unchecked"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      // Items with sources should have unchecked counts > 0
      const withSources = json.filter(
        (item: { sourceCount: number }) => Number(item.sourceCount) > 0,
      );
      for (const item of withSources) {
        const total = Number(item.uncheckedCardCount) + Number(item.uncheckedPrintingCount);
        expect(total).toBeGreaterThan(0);
      }
      // Test Card with unchecked sources should be present
      const testCard = json.find((r: { cardSlug: string | null }) => r.cardSlug === "TEST-001");
      expect(testCard).toBeDefined();
    });

    it("filter=unmatched returns only unmatched groups", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources?filter=unmatched"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      // Every item should have cardId === null
      for (const item of json) {
        expect(item.cardId).toBeNull();
      }
      // "Unknown Card" should be present
      const unmatched = json.find((r: { name: string }) => r.name === "Unknown Card");
      expect(unmatched).toBeDefined();
    });

    it("source=spreadsheet filters by source", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources?source=spreadsheet"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      // Only "Test Card" has a spreadsheet source
      expect(json).toHaveLength(1);
      expect(json[0].name).toBe("Test Card");
    });
  });

  // ── GET /admin/card-sources/export ────────────────────────────────────────

  describe("GET /admin/card-sources/export", () => {
    it("returns all cards with printings", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/export"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toBeArray();
      expect(json).toHaveLength(2);

      // Ordered by name: "Another Card" first, "Test Card" second
      expect(json[0].card.name).toBe("Another Card");
      expect(json[0].printings).toBeArray();
      expect(json[0].printings).toHaveLength(0);

      expect(json[1].card.name).toBe("Test Card");
      expect(json[1].printings).toBeArray();
      expect(json[1].printings).toHaveLength(1);
      expect(json[1].printings[0].source_id).toBe("TEST-001");
      expect(json[1].printings[0].set_id).toBe("TEST");
      expect(json[1].printings[0].rarity).toBe("Common");
    });
  });

  // ── GET /admin/card-sources/:cardId ───────────────────────────────────────

  describe("GET /admin/card-sources/:cardId", () => {
    it("returns card detail with sources and printings", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/TEST-001"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // Card shape
      expect(json.card).toBeDefined();
      expect(json.card.slug).toBe("TEST-001");
      expect(json.card.name).toBe("Test Card");
      expect(json.card.type).toBe("Unit");
      expect(json.card.domains).toEqual(["Arcane"]);
      expect(json.card.energy).toBe(2);
      expect(json.card.keywords).toEqual(["Flash"]);
      expect(json.card.rulesText).toBe("Flash");

      // Sources
      expect(json.sources).toBeArray();
      expect(json.sources.length).toBeGreaterThanOrEqual(1);
      const spreadsheetSource = json.sources.find(
        (s: { source: string }) => s.source === "spreadsheet",
      );
      expect(spreadsheetSource).toBeDefined();
      expect(spreadsheetSource.name).toBe("Test Card");
      expect(spreadsheetSource.sourceId).toBe("TEST-001");

      // Printings
      expect(json.printings).toBeArray();
      expect(json.printings).toHaveLength(1);
      expect(json.printings[0].sourceId).toBe("TEST-001");
      expect(json.printings[0].rarity).toBe("Common");
      expect(json.printings[0].setId).toBe("TEST");
    });

    it("response includes printingSources", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/TEST-001"));
      const json = await res.json();

      expect(json.printingSources).toBeArray();
      expect(json.printingSources.length).toBeGreaterThanOrEqual(1);

      const ps = json.printingSources[0];
      expect(ps.sourceId).toBe("TEST-001");
      expect(ps.setId).toBe("TEST");
      expect(ps.rarity).toBe("Common");
      expect(ps.imageUrl).toBe("https://example.com/test.png");
      expect(ps.cardSourceId).toBeString();
      expect(ps.createdAt).toBeString();
      expect(ps.updatedAt).toBeString();
    });

    it("returns printingImages array", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/TEST-001"));
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
      const res = await app.fetch(req("GET", "/admin/card-sources/new/unknowncard"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.name).toBe("Unknown Card");

      // Sources
      expect(json.sources).toBeArray();
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].source).toBe("gallery");
      expect(json.sources[0].name).toBe("Unknown Card");
      expect(json.sources[0].type).toBe("Rune");
      expect(json.sources[0].domains).toEqual(["Shadow"]);

      // Printing sources
      expect(json.printingSources).toBeArray();
      expect(json.printingSources).toHaveLength(1);
      expect(json.printingSources[0].sourceId).toBe("UNK-001");
      expect(json.printingSources[0].rarity).toBe("Rare");
      expect(json.printingSources[0].collectorNumber).toBe(99);
    });

    it("returns 404 for non-existent normalized name", async () => {
      const res = await app.fetch(req("GET", "/admin/card-sources/new/nonexistent"));
      expect(res.status).toBe(404);
    });
  });
});
