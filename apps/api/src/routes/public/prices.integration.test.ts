import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createTestContext, req, syncCardCardTypes } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Uses prefix PRC- for entities it creates.

const USER_ID = "a0000000-0023-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed IDs populated during setup
let setId: string;
let cardId: string;
let printingId: string;
let printingNoSourceId: string;

if (ctx) {
  const { db } = ctx;

  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "PRC-TEST", name: "PRC Price Test Set", printedTotal: 2, sortOrder: 200 })
    .returning("id")
    .execute();
  setId = setRow.id;

  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "PRC-001",
      name: "PRC Price Card",
      type: "unit",
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
  await syncCardCardTypes(db);

  await db.insertInto("cardDomains").values({ cardId, domainSlug: "mind", ordinal: 0 }).execute();

  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "PRC-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "PRC",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  const [printingNoSourceRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "PRC-002",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "PRC",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printingNoSourceId = printingNoSourceRow.id;

  // TCG has no per-language SKU axis, so language=null on the product row.
  const [tcgProduct] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "tcgplayer",
      externalId: 90_001,
      groupId: 24_439,
      productName: "PRC Price Card Normal",
      finish: "normal",
      language: null,
    })
    .returning("id")
    .execute();
  await db
    .insertInto("marketplaceProductVariants")
    .values({
      marketplaceProductId: tcgProduct.id,
      printingId,
    })
    .returning("id")
    .execute();

  // CM also has no per-language SKU axis.
  const [cmProduct] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "cardmarket",
      externalId: 90_002,
      groupId: 6289,
      productName: "PRC Price Card Normal",
      finish: "normal",
      language: null,
    })
    .returning("id")
    .execute();
  await db
    .insertInto("marketplaceProductVariants")
    .values({
      marketplaceProductId: cmProduct.id,
      printingId,
    })
    .returning("id")
    .execute();

  // Prices are keyed on the SKU product, not the variant — every variant
  // bound to the product inherits the history.
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  await db
    .insertInto("marketplaceProductPrices")
    .values([
      // Recent (2 days ago) — should appear in all ranges
      {
        marketplaceProductId: tcgProduct.id,
        recordedAt: daysAgo(2),
        marketCents: 250,
        lowCents: 120,
      },
      // 15 days ago — should appear in 30d, 90d, all
      {
        marketplaceProductId: tcgProduct.id,
        recordedAt: daysAgo(15),
        marketCents: 200,
        lowCents: 100,
      },
      // 60 days ago — should appear in 90d, all
      {
        marketplaceProductId: tcgProduct.id,
        recordedAt: daysAgo(60),
        marketCents: 150,
        lowCents: 80,
      },
      // 120 days ago — should only appear in "all"
      {
        marketplaceProductId: tcgProduct.id,
        recordedAt: daysAgo(120),
        marketCents: 100,
        lowCents: 50,
      },
    ])
    .execute();

  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: cmProduct.id,
      recordedAt: daysAgo(2),
      marketCents: 180,
      lowCents: 100,
    })
    .execute();

  // CT carries real per-variant language codes.
  const [ctProduct] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "cardtrader",
      externalId: 90_003,
      // group_id is NOT NULL with an FK to marketplace_groups(marketplace,
      // group_id); 4166 is the seeded cardtrader "Origins" group.
      groupId: 4166,
      productName: "PRC Price Card Normal",
      finish: "normal",
      language: "EN",
    })
    .returning("id")
    .execute();
  await db
    .insertInto("marketplaceProductVariants")
    .values({
      marketplaceProductId: ctProduct.id,
      printingId,
    })
    .returning("id")
    .execute();

  // Zero-eligible low 2 days ago + plain low 5 days ago.
  await db
    .insertInto("marketplaceProductPrices")
    .values([
      {
        marketplaceProductId: ctProduct.id,
        recordedAt: daysAgo(2),
        marketCents: null,
        lowCents: 300,
        zeroLowCents: 420,
      },
      {
        marketplaceProductId: ctProduct.id,
        recordedAt: daysAgo(5),
        marketCents: null,
        lowCents: 280,
        zeroLowCents: null,
      },
    ])
    .execute();

  // GET /prices reads headline prices from the mv_latest_printing_prices
  // materialized view. The runner refreshes it during setup, before this
  // file seeds its prices at import time — so refresh again to surface them.
  // Daily first: the latest view is defined over it.
  await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`.execute(db);
  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}

describe.skipIf(!ctx)("Prices routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  describe("GET /prices", () => {
    it("returns 200 with a prices map", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.prices).toBeDefined();
      expect(typeof json.prices).toBe("object");
    });

    it("includes the seeded printing with a headline price per marketplace", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      const json = await readJson(res);

      // mv_latest_printing_prices picks the headline per marketplace; the wire
      // carries integer cents:
      //   tcgplayer  → COALESCE(market_cents, low_cents) = 250
      //   cardmarket → COALESCE(low_cents, market_cents) = 100
      //   cardtrader → COALESCE(zero_low_cents, low_cents) = 420
      //     (latest row prefers the one with a zero-eligible low: 2 days ago)
      expect(json.prices[printingId]).toEqual({
        tcgplayer: 250,
        cardmarket: 100,
        cardtrader: 420,
      });
    });

    it("does not include printings without marketplace sources", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      const json = await readJson(res);

      expect(json.prices[printingNoSourceId]).toBeUndefined();
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/prices"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, stale-while-revalidate=86400",
      );
    });
  });

  describe("GET /prices/:printingId/history", () => {
    it("returns history with both tcgplayer and cardmarket data", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      expect(res.status).toBe(200);

      const json = await readJson(res);

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

      const json = await readJson(res);
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

      const json = await readJson(res);
      expect(json.tcgplayer.available).toBe(false);
      expect(json.cardmarket.available).toBe(false);
    });

    it("default range is 30d — excludes snapshots older than 30 days", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      const json = await readJson(res);

      // With default 30d range: 2-day-old and 15-day-old tcgplayer snapshots
      // should be included, but 60-day and 120-day should be excluded
      expect(json.tcgplayer.snapshots.length).toBe(2);
    });

    it("range=7d filters to only recent snapshots", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await readJson(res);

      // Only the 2-day-old snapshot should be included
      expect(json.tcgplayer.snapshots.length).toBe(1);
    });

    it("range=90d includes snapshots up to 90 days old", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=90d`));
      const json = await readJson(res);

      // 2-day, 15-day, 60-day snapshots included; 120-day excluded
      expect(json.tcgplayer.snapshots.length).toBe(3);
    });

    it("range=all returns all snapshots", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=all`));
      const json = await readJson(res);

      // All 4 tcgplayer snapshots
      expect(json.tcgplayer.snapshots.length).toBe(4);
    });

    it("tcgplayer snapshots have correct shape", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await readJson(res);

      const snap = json.tcgplayer.snapshots[0];
      expect(snap.date).toBeTypeOf("string");
      expect(typeof snap.market).toBe("number");
      expect(snap.market).toBe(250); // integer cents
      expect(snap.low).toBe(120);
      expect(snap.mid).toBeUndefined();
      expect(snap.high).toBeUndefined();
    });

    it("cardmarket snapshots have correct shape", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await readJson(res);

      const snap = json.cardmarket.snapshots[0];
      expect(snap.date).toBeTypeOf("string");
      expect(snap.market).toBe(180);
      expect(snap.low).toBe(100);
      expect(snap.trend).toBeUndefined();
      expect(snap.avg1).toBeUndefined();
      expect(snap.avg30).toBeUndefined();
    });

    it("cardtrader snapshots carry zeroLow and low", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=7d`));
      const json = await readJson(res);

      expect(json.cardtrader.available).toBe(true);
      expect(json.cardtrader.productId).toBe(90_003);
      expect(json.cardtrader.snapshots.length).toBe(2);

      // Sort ascending by date, so oldest (5 days ago, no Zero) then newest (2 days ago, with Zero).
      const [older, newer] = json.cardtrader.snapshots;
      expect(older.zeroLow).toBeNull();
      expect(older.low).toBe(280); // integer cents
      expect(newer.zeroLow).toBe(420);
      expect(newer.low).toBe(300); // overall low remains cheaper than the Zero low
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history`));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, stale-while-revalidate=86400",
      );
    });

    it("snapshots are ordered chronologically (ascending)", async () => {
      const res = await app.fetch(req("GET", `/prices/${printingId}/history?range=all`));
      const json = await readJson(res);

      const dates = json.tcgplayer.snapshots.map((s: { date: string }) => s.date);
      const sorted = dates.toSorted();
      expect(dates).toEqual(sorted);
    });
  });
});
