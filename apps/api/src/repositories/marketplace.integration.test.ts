import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CARD_FURY_RUNE, PRINTING_1, PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

const ctx = createDbContext("a0000000-0030-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = marketplaceRepo(db);

  // Use the seed printing but create our own marketplace data with unique
  // marketplace names so other tests' cleanup never deletes them.
  const anniePrintingId = PRINTING_1.id;
  const mpTcg = "mp-repo-test-tcg";
  const mpCm = "mp-repo-test-cm";
  // Third marketplace, used only by the deckValues language tests so their
  // prices can't shift the assertions above.
  const mpLang = "mp-repo-test-lang";

  // Fury Rune is printed in both EN and SC in the seed, which is what the
  // language-aware pricing needs.
  const runeEnPrintingId = PRINTINGS["OGN-007:common:normal::EN"].id;
  const runeScPrintingId = PRINTINGS["OGN-007:common:normal::SC"].id;

  let tcgVariantId = "";
  let tcgProductId = "";
  let langDeckId = "";

  // Track recordedAt timestamps we inserted for cleanup
  const createdPriceKeys: { productId: string; recordedAt: Date }[] = [];
  const createdDeckIds: string[] = [];

  beforeAll(async () => {
    // Create marketplace groups for our test marketplaces
    await db
      .insertInto("marketplaceGroups")
      .values([
        { marketplace: mpTcg, groupId: 80_001, name: "MP Repo Test TCG", abbreviation: null },
        { marketplace: mpCm, groupId: 80_002, name: "MP Repo Test CM", abbreviation: null },
        { marketplace: mpLang, groupId: 80_003, name: "MP Repo Test Lang", abbreviation: null },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    // Create products + variants for the same printing in two marketplaces.
    // Each product represents one SKU; CM/TCG stand-ins use language=null.
    const [tcgProduct] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: mpTcg,
        groupId: 80_001,
        externalId: 653_136,
        productName: "Annie Fiery (Test TCG)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();
    tcgProductId = tcgProduct.id;

    const [tcgVariant] = await db
      .insertInto("marketplaceProductVariants")
      .values({
        marketplaceProductId: tcgProduct.id,
        printingId: anniePrintingId,
      })
      .returning("id")
      .execute();
    tcgVariantId = tcgVariant.id;

    const [cmProduct] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: mpCm,
        groupId: 80_002,
        externalId: 847_523,
        productName: "Annie, Fiery (Test CM)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();

    await db
      .insertInto("marketplaceProductVariants")
      .values({
        marketplaceProductId: cmProduct.id,
        printingId: anniePrintingId,
      })
      .execute();

    // Two SKUs of the same card on one marketplace, one per language, with the
    // out-of-language one deliberately cheaper — this is the CardTrader shape
    // that made the tile read lower than the deck page.
    const langProducts = await db
      .insertInto("marketplaceProducts")
      .values([
        {
          marketplace: mpLang,
          groupId: 80_003,
          externalId: 913_001,
          productName: "Fury Rune (Test EN)",
          finish: "normal",
          language: "EN",
        },
        {
          marketplace: mpLang,
          groupId: 80_003,
          externalId: 913_002,
          productName: "Fury Rune (Test SC)",
          finish: "normal",
          language: "SC",
        },
      ])
      .returning(["id", "language"])
      .execute();
    const langEnProductId = langProducts.find((row) => row.language === "EN")!.id;
    const langScProductId = langProducts.find((row) => row.language === "SC")!.id;

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: langEnProductId, printingId: runeEnPrintingId },
        { marketplaceProductId: langScProductId, printingId: runeScPrintingId },
      ])
      .execute();

    const langPriceAt = new Date("2026-03-01T00:00:00Z");
    await db
      .insertInto("marketplaceProductPrices")
      .values([
        {
          marketplaceProductId: langEnProductId,
          marketCents: 500,
          lowCents: 500,
          recordedAt: langPriceAt,
        },
        {
          marketplaceProductId: langScProductId,
          marketCents: 100,
          lowCents: 100,
          recordedAt: langPriceAt,
        },
      ])
      .execute();
    createdPriceKeys.push(
      { productId: langEnProductId, recordedAt: langPriceAt },
      { productId: langScProductId, recordedAt: langPriceAt },
    );

    await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`.execute(db);
    await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);

    // A deck holding a single copy of that card, so the deck total is exactly
    // the price of whichever printing the query picked.
    const [deck] = await db
      .insertInto("decks")
      .values({
        userId,
        name: "MP Repo Test Language Deck",
        description: null,
        format: "freeform",
        formatConfig: null,
        isWanted: false,
        isPublic: false,
      })
      .returning("id")
      .execute();
    langDeckId = deck.id;
    createdDeckIds.push(deck.id);

    await db
      .insertInto("deckCards")
      .values({
        deckId: deck.id,
        cardId: CARD_FURY_RUNE.id,
        zone: "main",
        quantity: 1,
      })
      .execute();
  });

  afterAll(async () => {
    for (const deckId of createdDeckIds.toReversed()) {
      await db.deleteFrom("deckCards").where("deckId", "=", deckId).execute();
      await db.deleteFrom("decks").where("id", "=", deckId).execute();
    }
    for (const key of createdPriceKeys.toReversed()) {
      await db
        .deleteFrom("marketplaceProductPrices")
        .where("marketplaceProductId", "=", key.productId)
        .where("recordedAt", "=", key.recordedAt)
        .execute();
    }
    // Delete variants first (FK), then products.
    await sql`
      DELETE FROM marketplace_product_variants mpv
      USING marketplace_products mp
      WHERE mp.id = mpv.marketplace_product_id
        AND mp.marketplace IN (${mpTcg}, ${mpCm}, ${mpLang})
    `.execute(db);
    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "in", [mpTcg, mpCm, mpLang])
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "in", [mpTcg, mpCm, mpLang])
      .execute();
  });

  // ---------------------------------------------------------------------------
  // sourcesForPrinting
  // ---------------------------------------------------------------------------

  it("returns marketplace sources for a known printing", async () => {
    const sources = await repo.sourcesForPrinting(anniePrintingId);

    // At least our 2 test products (other tests may have added more)
    expect(sources.length).toBeGreaterThanOrEqual(2);

    const testSources = sources.filter((s) => s.marketplace === mpTcg || s.marketplace === mpCm);
    expect(testSources.length).toBe(2);
  });

  it("returns empty array for a nonexistent printing", async () => {
    const sources = await repo.sourcesForPrinting("a0000000-0000-4000-a000-000000000000");

    expect(sources).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // snapshots
  // ---------------------------------------------------------------------------

  it("returns snapshots ordered by recordedAt ascending", async () => {
    // Insert two price rows for our TCG product. `snapshots()` reads per-product
    // via the mpv ↔ product join.
    const snap1At = new Date("2026-01-01T00:00:00Z");
    const snap2At = new Date("2026-02-01T00:00:00Z");
    await db
      .insertInto("marketplaceProductPrices")
      .values([
        {
          marketplaceProductId: tcgProductId,
          marketCents: 100,
          lowCents: 80,
          recordedAt: snap1At,
        },
        {
          marketplaceProductId: tcgProductId,
          marketCents: 120,
          lowCents: 90,
          recordedAt: snap2At,
        },
      ])
      .execute();
    createdPriceKeys.push(
      { productId: tcgProductId, recordedAt: snap1At },
      { productId: tcgProductId, recordedAt: snap2At },
    );

    // Refresh the MVs so latestPrices() sees the new rows. Daily first — the
    // latest view is defined over it (migration 219).
    await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`.execute(db);
    await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);

    const snaps = await repo.snapshots(tcgVariantId, null);

    expect(snaps.length).toBeGreaterThanOrEqual(2);
    // Verify ascending order
    for (let i = 1; i < snaps.length; i++) {
      expect(new Date(snaps[i].recordedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(snaps[i - 1].recordedAt).getTime(),
      );
    }
  });

  it("filters snapshots by cutoff date", async () => {
    const cutoff = new Date("2026-01-15T00:00:00Z");
    const snaps = await repo.snapshots(tcgVariantId, cutoff);

    // Should only include snap2 (Feb) and anything after cutoff
    for (const s of snaps) {
      expect(new Date(s.recordedAt).getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });

  it("returns empty array for a nonexistent variant", async () => {
    const snaps = await repo.snapshots("a0000000-0000-4000-a000-000000000000", null);

    expect(snaps).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // latestPrices
  // ---------------------------------------------------------------------------

  it("returns latest prices with printingId and marketCents", async () => {
    const prices = await repo.latestPrices();

    // We inserted snapshots for our TCG product, so it should appear
    expect(prices.length).toBeGreaterThanOrEqual(1);

    // Filter by our test marketplace so seed-data rows for the same printing
    // in other marketplaces (e.g. cardmarket) don't shadow our inserted price.
    const anniePrice = prices.find(
      (p) => p.printingId === anniePrintingId && p.marketplace === mpTcg,
    );
    expect(anniePrice).toBeDefined();
    // The latest snapshot is snap2 with marketCents=120
    expect(anniePrice!.marketCents).toBe(120);
  });

  it("each row has printingId and marketCents fields", async () => {
    const prices = await repo.latestPrices();

    for (const p of prices) {
      expect(p.printingId).toBeDefined();
      expect(typeof p.marketCents).toBe("number");
    }
  });

  // ---------------------------------------------------------------------------
  // deckValues
  // ---------------------------------------------------------------------------

  it("prices a card at its cheapest printing in the requested languages", async () => {
    const values = await repo.deckValues(userId, mpLang, ["EN"]);

    // The SC printing is cheaper (100), but the viewer only collects EN.
    expect(values.get(langDeckId)).toBe(500);
  });

  it("picks the cheaper printing when its language is requested too", async () => {
    const values = await repo.deckValues(userId, mpLang, ["EN", "SC"]);

    expect(values.get(langDeckId)).toBe(100);
  });

  it("falls back to any language when nothing is priced in the requested ones", async () => {
    const values = await repo.deckValues(userId, mpLang, ["FR"]);

    expect(values.get(langDeckId)).toBe(100);
  });

  it("prices at the plain cheapest printing when no languages are given", async () => {
    const empty = await repo.deckValues(userId, mpLang, []);
    const absent = await repo.deckValues(userId, mpLang);

    expect(empty.get(langDeckId)).toBe(100);
    expect(absent.get(langDeckId)).toBe(100);
  });
});
