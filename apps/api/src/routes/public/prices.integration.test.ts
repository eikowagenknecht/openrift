import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Prices routes
//
// GET /prices — latest market prices per marketplace for all printings
// GET /prices/:printingId/history — price history per printing
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix PRC- for entities it creates.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0023-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed IDs populated during setup
let setId: string;
let cardId: string;
let printingId: string;
let printingNoSourceId: string;
let tcgSourceId: string;
let cmSourceId: string;

if (ctx) {
  const { db } = ctx;

  // Seed set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "PRC-TEST", name: "PRC Price Test Set", printedTotal: 2, sortOrder: 200 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Seed card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "PRC-001",
      name: "PRC Price Card",
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

  // Seed printing with marketplace sources
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "PRC-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "PRC",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Seed a second printing with NO marketplace sources
  const [printingNoSourceRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "PRC-002",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "PRC",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingNoSourceId = printingNoSourceRow.id;

  // TCGPlayer marketplace source for printingId
  const [tcgRow] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "tcgplayer",
      externalId: 90_001,
      groupId: 24_439,
      productName: "PRC Price Card Normal",
      printingId,
      language: "EN",
    })
    .returning("id")
    .execute();
  tcgSourceId = tcgRow.id;

  // Cardmarket marketplace source for printingId
  const [cmRow] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "cardmarket",
      externalId: 90_002,
      groupId: 6289,
      productName: "PRC Price Card Normal",
      printingId,
      language: "EN",
    })
    .returning("id")
    .execute();
  cmSourceId = cmRow.id;

  // TCGPlayer snapshots at various dates
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  // Recent snapshot (2 days ago) — should appear in all ranges
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      productId: tcgSourceId,
      recordedAt: daysAgo(2),
      marketCents: 250,
      lowCents: 120,
    })
    .execute();

  // Older snapshot (15 days ago) — should appear in 30d, 90d, all
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      productId: tcgSourceId,
      recordedAt: daysAgo(15),
      marketCents: 200,
      lowCents: 100,
    })
    .execute();

  // Old snapshot (60 days ago) — should appear in 90d, all
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      productId: tcgSourceId,
      recordedAt: daysAgo(60),
      marketCents: 150,
      lowCents: 80,
    })
    .execute();

  // Very old snapshot (120 days ago) — should only appear in "all"
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      productId: tcgSourceId,
      recordedAt: daysAgo(120),
      marketCents: 100,
      lowCents: 50,
    })
    .execute();

  // Cardmarket snapshot (2 days ago)
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      productId: cmSourceId,
      recordedAt: daysAgo(2),
      marketCents: 180,
      lowCents: 100,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Prices routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // ── GET /prices ─────────────────────────────────────────────────────────

  describe("GET /prices", () => {
    it("returns 200 with a prices map", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.prices).toBeDefined();
      expect(typeof json.prices).toBe("object");
    });

    it("includes the seeded printing with prices for both marketplaces", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      const json = await res.json();

      // Most recent tcgplayer snapshot: 250 cents -> $2.50
      // Most recent cardmarket snapshot: 180 cents -> $1.80
      expect(json.prices[printingId]).toEqual({
        tcgplayer: 2.5,
        cardmarket: 1.8,
      });
    });

    it("does not include printings without marketplace sources", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      const json = await res.json();

      expect(json.prices[printingNoSourceId]).toBeUndefined();
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, stale-while-revalidate=300",
      );
    });
  });

  // ── GET /prices/:printingId/history ──────────────────────────────────────

  describe("GET /prices/:printingId/history", () => {
    it("returns history with both tcgplayer and cardmarket data", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      expect(res.status).toBe(200);

      const json = await res.json();

      expect(json.tcgplayer.available).toBe(true);
      expect(json.tcgplayer.productId).toBe(90_001);
      expect(json.tcgplayer.snapshots).toEqual(expect.any(Array));
      expect(json.tcgplayer.snapshots.length).toBeGreaterThanOrEqual(1);

      expect(json.cardmarket.available).toBe(true);
      expect(json.cardmarket.productId).toBe(90_002);
      expect(json.cardmarket.snapshots).toEqual(expect.any(Array));
      expect(json.cardmarket.snapshots.length).toBeGreaterThanOrEqual(1);
    });

    it("returns available: false for non-existent printing", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await app.fetch(req("GET", `/prices/${fakeId}/history`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tcgplayer.available).toBe(false);
      expect(json.tcgplayer.productId).toBeNull();
      expect(json.tcgplayer.snapshots).toHaveLength(0);
      expect(json.cardmarket.available).toBe(false);
      expect(json.cardmarket.productId).toBeNull();
      expect(json.cardmarket.snapshots).toHaveLength(0);
    });

    it("returns available: false for printing with no marketplace sources", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingNoSourceId}/history`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tcgplayer.available).toBe(false);
      expect(json.cardmarket.available).toBe(false);
    });

    it("default range is 30d — excludes snapshots older than 30 days", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      const json = await res.json();

      // With default 30d range: 2-day-old and 15-day-old tcgplayer snapshots
      // should be included, but 60-day and 120-day should be excluded
      expect(json.tcgplayer.snapshots.length).toBe(2);
    });

    it("range=7d filters to only recent snapshots", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await res.json();

      // Only the 2-day-old snapshot should be included
      expect(json.tcgplayer.snapshots.length).toBe(1);
    });

    it("range=90d includes snapshots up to 90 days old", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=90d`));
      const json = await res.json();

      // 2-day, 15-day, 60-day snapshots included; 120-day excluded
      expect(json.tcgplayer.snapshots.length).toBe(3);
    });

    it("range=all returns all snapshots", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=all`));
      const json = await res.json();

      // All 4 tcgplayer snapshots
      expect(json.tcgplayer.snapshots.length).toBe(4);
    });

    it("tcgplayer snapshots have correct shape", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await res.json();

      const snap = json.tcgplayer.snapshots[0];
      expect(snap.date).toBeTypeOf("string");
      expect(typeof snap.market).toBe("number");
      expect(snap.market).toBe(2.5); // 250 cents
      expect(snap.low).toBe(1.2); // 120 cents
      expect(snap.mid).toBeUndefined();
      expect(snap.high).toBeUndefined();
    });

    it("cardmarket snapshots have correct shape", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await res.json();

      const snap = json.cardmarket.snapshots[0];
      expect(snap.date).toBeTypeOf("string");
      expect(snap.market).toBe(1.8); // 180 cents
      expect(snap.low).toBe(1); // 100 cents
      expect(snap.trend).toBeUndefined();
      expect(snap.avg1).toBeUndefined();
      expect(snap.avg30).toBeUndefined();
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, stale-while-revalidate=300",
      );
    });

    it("snapshots are ordered chronologically (ascending)", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=all`));
      const json = await res.json();

      const dates = json.tcgplayer.snapshots.map((s: { date: string }) => s.date);
      const sorted = dates.toSorted();
      expect(dates).toEqual(sorted);
    });
  });
});
