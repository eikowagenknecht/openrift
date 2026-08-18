import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CARD_FURY_RUNE, PRINTING_1, PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

const ctx = createDbContext("a0000000-0030-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = marketplaceRepo(db);

  // Real marketplace names — the CHECK constraint (migration 247) rejects
  // made-up ones. The seed carries products AND prices for these same cards
  // under every real marketplace, so isolation comes from two levers:
  //   - this file's own 913_xxx externalId range keys every scoped assertion
  //     and the cleanup;
  //   - every price this file inserts is dated far in the future (2126), so
  //     `mv_latest_printing_prices` (DISTINCT ON (printing, marketplace),
  //     latest day wins) deterministically shows THIS file's rows for the
  //     printings under test, seed data and carry-forward islands included.
  // The afterAll deletes the fixture rows and refreshes both MVs, so the
  // future-dated prices cannot leak into later test files.
  const anniePrintingId = PRINTING_1.id;
  const mpTcg = "tcgplayer" as const;
  const mpCm = "cardmarket" as const;
  // Third marketplace, used only by the deckValues language tests so their
  // prices can't shift the assertions above.
  const mpLang = "cardtrader" as const;

  const tcgGroupId = 80_101;
  const cmGroupId = 80_102;
  const langGroupId = 80_103;
  const tcgExternalId = 913_101;
  const cmExternalId = 913_102;

  // Fury Rune is printed in both EN and SC in the seed, which is what the
  // language-aware pricing needs.
  const runeEnPrintingId = PRINTINGS["OGN-007:common:normal::EN"].id;
  const runeScPrintingId = PRINTINGS["OGN-007:common:normal::SC"].id;

  let tcgVariantId = "";
  let tcgProductId = "";
  let langDeckId = "";

  const createdProductIds: string[] = [];
  const createdDeckIds: string[] = [];

  beforeAll(async () => {
    // Groups in this file's own id range; products FK (marketplace, group_id).
    await db
      .insertInto("marketplaceGroups")
      .values([
        { marketplace: mpTcg, groupId: tcgGroupId, name: "MP Repo Test TCG", abbreviation: null },
        { marketplace: mpCm, groupId: cmGroupId, name: "MP Repo Test CM", abbreviation: null },
        {
          marketplace: mpLang,
          groupId: langGroupId,
          name: "MP Repo Test Lang",
          abbreviation: null,
        },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    // Create products + variants for the same printing in two marketplaces.
    // Each product represents one SKU; CM/TCG products carry language=null.
    const [tcgProduct] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: mpTcg,
        groupId: tcgGroupId,
        externalId: tcgExternalId,
        productName: "Annie Fiery (Test TCG)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();
    tcgProductId = tcgProduct.id;
    createdProductIds.push(tcgProduct.id);

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
        groupId: cmGroupId,
        externalId: cmExternalId,
        productName: "Annie, Fiery (Test CM)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();
    createdProductIds.push(cmProduct.id);

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
          groupId: langGroupId,
          externalId: 913_001,
          productName: "Fury Rune (Test EN)",
          finish: "normal",
          language: "EN",
        },
        {
          marketplace: mpLang,
          groupId: langGroupId,
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
    createdProductIds.push(langEnProductId, langScProductId);

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: langEnProductId, printingId: runeEnPrintingId },
        { marketplaceProductId: langScProductId, printingId: runeScPrintingId },
      ])
      .execute();

    // deckValues picks the cheapest across ALL of the card's printings, and
    // the seed prices several of them under cardtrader (showcase foils, SFD
    // reprints). Override every other printing of the card with a high
    // future-dated price so the cheapest-EN / cheapest-SC math stays exact.
    const otherPrintings = await db
      .selectFrom("printings")
      .select("id")
      .where("cardId", "=", CARD_FURY_RUNE.id)
      .where("id", "not in", [runeEnPrintingId, runeScPrintingId])
      .execute();
    const overrideProducts = await db
      .insertInto("marketplaceProducts")
      .values(
        otherPrintings.map((_row, index) => ({
          marketplace: mpLang,
          groupId: langGroupId,
          externalId: 913_003 + index,
          productName: `Fury Rune Override ${index}`,
          finish: "foil",
          language: null,
        })),
      )
      .returning("id")
      .execute();
    createdProductIds.push(...overrideProducts.map((row) => row.id));

    await db
      .insertInto("marketplaceProductVariants")
      .values(
        otherPrintings.map((row, index) => ({
          marketplaceProductId: overrideProducts[index].id,
          printingId: row.id,
        })),
      )
      .execute();

    const langPriceAt = new Date("2126-03-01T00:00:00Z");
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
        ...overrideProducts.map((row) => ({
          marketplaceProductId: row.id,
          marketCents: 900,
          lowCents: 900,
          recordedAt: langPriceAt,
        })),
      ])
      .execute();

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
    // This file's rows only, keyed by tracked product ids: prices cascade from
    // the product delete, variants don't (plain FK) and go first.
    await db
      .deleteFrom("marketplaceProductVariants")
      .where("marketplaceProductId", "in", createdProductIds)
      .execute();
    await db.deleteFrom("marketplaceProducts").where("id", "in", createdProductIds).execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where((eb) =>
        eb.or([
          eb.and([eb("marketplace", "=", mpTcg), eb("groupId", "=", tcgGroupId)]),
          eb.and([eb("marketplace", "=", mpCm), eb("groupId", "=", cmGroupId)]),
          eb.and([eb("marketplace", "=", mpLang), eb("groupId", "=", langGroupId)]),
        ]),
      )
      .execute();
    // Purge the future-dated fixture prices from the MVs, or every later file
    // reading them would see this file's 2126 rows as "latest".
    await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`.execute(db);
    await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
  });

  // ---------------------------------------------------------------------------
  // sourcesForPrinting
  // ---------------------------------------------------------------------------

  it("returns marketplace sources for a known printing", async () => {
    const sources = await repo.sourcesForPrinting(anniePrintingId);

    // The seed binds this printing too, so scope to this file's externalIds.
    const testSources = sources.filter(
      (s) => s.externalId === tcgExternalId || s.externalId === cmExternalId,
    );
    expect(testSources.length).toBe(2);
    expect(new Set(testSources.map((s) => s.marketplace))).toEqual(new Set([mpTcg, mpCm]));
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
    // via the mpv ↔ product join, so only this file's rows can appear.
    const snap1At = new Date("2126-01-01T00:00:00Z");
    const snap2At = new Date("2126-02-01T00:00:00Z");
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
    const cutoff = new Date("2126-01-15T00:00:00Z");
    const snaps = await repo.snapshots(tcgVariantId, cutoff);

    // Should only include snap2 (Feb 2126) and anything after cutoff
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

    // The MV keeps one row per (printing, marketplace), latest day first. The
    // seed prices this printing under tcgplayer too, but this file's snapshots
    // are dated 2126, so they are the latest and define the row.
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
    // (The showcase printings sit at 900, so they can't win either.)
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
