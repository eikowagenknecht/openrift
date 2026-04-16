import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, OGS_SET, PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

const USER_ID = "a0000000-0024-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

const SEED_SET_ID = OGS_SET.id;
const SEED_PRINTING_ID = PRINTING_1.id;

// Marketplace used to seed snapshots for the /api/v1/prices integration tests.
// The /catalog route no longer joins prices — they live on /api/v1/prices.
const MARKETPLACE = "tcgplayer";

describe.skipIf(!ctx)("Catalog route (integration)", () => {
  const { app, db } = ctx!;

  let variantId = "";

  beforeAll(async () => {
    await db
      .insertInto("printingImages")
      .values({
        printingId: SEED_PRINTING_ID,
        face: "front",
        provider: "cat-test",
        originalUrl: "https://example.com/cat-test-front.png",
        rehostedUrl: null,
        isActive: true,
      })
      .onConflict((oc) => oc.columns(["printingId", "face", "provider"]).doNothing())
      .execute();

    // Seed data has a tcgplayer variant for this printing; look it up so we
    // can attach our snapshot to it.
    const existing = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select("mpv.id as variantId")
      .where("mp.marketplace", "=", MARKETPLACE)
      .where("mpv.printingId", "=", SEED_PRINTING_ID)
      .executeTakeFirst();

    if (existing) {
      variantId = existing.variantId;
    } else {
      // If seed data was somehow removed, create our own product + variant.
      const groupRow = await db
        .selectFrom("marketplaceGroups")
        .select("groupId")
        .where("marketplace", "=", MARKETPLACE)
        .executeTakeFirst();

      const groupId = groupRow?.groupId ?? 24_439;

      await db
        .insertInto("marketplaceGroups")
        .values({
          marketplace: MARKETPLACE,
          groupId,
          name: "Cat Test TCG Group",
          abbreviation: null,
        })
        .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
        .execute();

      const [product] = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace: MARKETPLACE,
          groupId,
          externalId: 999_001,
          productName: "Annie Fiery (Cat Test)",
        })
        .returning("id")
        .execute();

      const [variant] = await db
        .insertInto("marketplaceProductVariants")
        .values({
          marketplaceProductId: product.id,
          printingId: SEED_PRINTING_ID,
          finish: "normal",
          language: "EN",
        })
        .returning("id")
        .execute();
      variantId = variant.id;
    }

    await db
      .insertInto("marketplaceSnapshots")
      .values({
        variantId,
        recordedAt: new Date("2026-03-15T10:00:00Z"),
        marketCents: 350,
        lowCents: 200,
        midCents: 280,
        highCents: 500,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      })
      .onConflict((oc) => oc.columns(["variantId", "recordedAt"]).doNothing())
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("printingImages").where("provider", "=", "cat-test").execute();
    if (variantId) {
      await db
        .deleteFrom("marketplaceSnapshots")
        .where("variantId", "=", variantId)
        .where("recordedAt", "=", new Date("2026-03-15T10:00:00Z"))
        .execute();
    }
  });

  describe("GET /catalog", () => {
    it("returns 200 with sets, cards, and printings", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.sets)).toBe(true);
      expect(typeof json.cards).toBe("object");
      expect(typeof json.printings).toBe("object");
      expect(Array.isArray(json.printings)).toBe(false);
    });

    it("sets contain id, slug, and name", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const ogsSet = json.sets.find((s: { id: string }) => s.id === SEED_SET_ID);
      expect(ogsSet).toBeDefined();
      expect(ogsSet.slug).toBe("OGS");
      expect(ogsSet.name).toBe("Proving Grounds");
    });

    it("cards contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const annieCardId = CARD_FURY_UNIT.id;
      const annie = json.cards[annieCardId];
      expect(annie).toBeDefined();
      expect(annie.id).toBeUndefined();
      expect(annie.name).toBe("Annie, Fiery");
      expect(annie.type).toBe("Unit");
      expect(annie.superTypes).toContain("Champion");
      expect(annie.domains).toContain("Fury");
    });

    it("printings contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings[SEED_PRINTING_ID];
      expect(printing).toBeDefined();
      expect(printing.id).toBeUndefined();
      expect(printing.cardId).toBe(CARD_FURY_UNIT.id);
      expect(printing.setId).toBe(SEED_SET_ID);
      expect(printing.shortCode).toBe("OGS-001");
      expect(printing.rarity).toBe("Epic");
      expect(printing.markers).toEqual([]);
      expect(printing.distributionChannels).toEqual([]);
    });

    it("printing does not include marketPrice (prices live on /api/v1/prices)", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings[SEED_PRINTING_ID];
      expect("marketPrice" in printing).toBe(false);
      expect("marketPrices" in printing).toBe(false);
    });

    it("printings include images array", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings[SEED_PRINTING_ID];
      expect(Array.isArray(printing.images)).toBe(true);
      expect(printing.images.length).toBeGreaterThanOrEqual(1);
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, stale-while-revalidate=86400",
      );
    });
  });
});
