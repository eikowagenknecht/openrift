import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { CARDS, OGS_SET, PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext, syncCardCardTypes } from "../test/integration-context.js";

const USER_ID = "a0000000-0197-4000-a000-000000000002";
const ctx = createDbContext(USER_ID);

// Two printings of the same card (normal + foil promo). ADR-015 models finish
// as printing identity, so a product shipping both is two content rows.
const ANNIE = CARDS["annie-fiery"];
const ANNIE_NORMAL = PRINTINGS["OGS-001:epic:normal::EN"];
const ANNIE_FOIL = PRINTINGS["OGS-001:epic:foil:promo:EN"];
// A printing of a different card, to prove the lookup does not leak across cards.
const FIRESTORM_NORMAL = PRINTINGS["OGS-002:uncommon:normal::EN"];
// A card this file never puts in a product, for the empty case.
const UNUSED_CARD = CARDS["master-yi-meditative"];

describe.skipIf(!ctx)("products repo productsForCard (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repos = createRepos(db);

  const createdProductIds: string[] = [];
  let slugCounter = 0;

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db.deleteFrom("products").where("id", "in", createdProductIds).execute();
    }
  });

  /** @returns A product with the given contents, cleaned up in afterAll. */
  async function makeProduct(name: string, rows: { printingId: string; quantity: number }[]) {
    slugCounter += 1;
    const product = await repos.products.create({
      slug: `products-repo-itest-${slugCounter}`,
      name,
      description: null,
      setId: null,
    });
    createdProductIds.push(product.id);
    await repos.products.replaceContents(product.id, rows);
    return product;
  }

  it("returns one row per printing+product, with quantities", async () => {
    await makeProduct("Zed Signature Kit", [
      { printingId: ANNIE_NORMAL.id, quantity: 2 },
      { printingId: ANNIE_FOIL.id, quantity: 1 },
    ]);

    const rows = await repos.products.productsForCard(ANNIE.id);

    // Rows of one product across printings have no defined relative order (the
    // query sorts by product name only); the UI reads one printing at a time,
    // where the PK makes each product appear at most once.
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          printingId: ANNIE_NORMAL.id,
          name: "Zed Signature Kit",
          quantity: 2,
        }),
        expect.objectContaining({
          printingId: ANNIE_FOIL.id,
          name: "Zed Signature Kit",
          quantity: 1,
        }),
      ]),
    );
  });

  it("finds every product containing any printing of the card, ordered by name", async () => {
    await makeProduct("Summoner Skirmish Bundle", [{ printingId: ANNIE_NORMAL.id, quantity: 1 }]);
    await makeProduct("Aram Starter Box", [{ printingId: ANNIE_FOIL.id, quantity: 3 }]);

    const rows = await repos.products.productsForCard(ANNIE.id);
    const names = rows.map((r) => r.name);

    expect(names).toContain("Summoner Skirmish Bundle");
    expect(names).toContain("Aram Starter Box");
    expect(names).toEqual([...names].toSorted());
  });

  it("does not leak products of other cards", async () => {
    await makeProduct("Firestorm Only Box", [{ printingId: FIRESTORM_NORMAL.id, quantity: 1 }]);

    const rows = await repos.products.productsForCard(ANNIE.id);

    expect(rows.map((r) => r.name)).not.toContain("Firestorm Only Box");
    expect(rows.every((r) => r.printingId !== FIRESTORM_NORMAL.id)).toBe(true);
  });

  it("returns an empty array for a card in no product", async () => {
    expect(await repos.products.productsForCard(UNUSED_CARD.id)).toEqual([]);
  });
});

describe.skipIf(!ctx)("products repo coverCards (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repos = createRepos(db);

  const cardIds: string[] = [];
  const printingIds: string[] = [];
  const imageFileIds: string[] = [];
  const productIds: string[] = [];
  let counter = 0;

  async function makeCard(name: string, type: string): Promise<string> {
    counter += 1;
    const card = await db
      .insertInto("cards")
      .values({
        slug: `cover-itest-${counter}`,
        name,
        type,
        might: null,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardIds.push(card.id);
    return card.id;
  }

  async function makePrinting(cardId: string, rarity: string, publicCode: string): Promise<string> {
    counter += 1;
    const printing = await db
      .insertInto("printings")
      .values({
        cardId,
        setId: OGS_SET.id,
        shortCode: `COV-${counter}`,
        rarity,
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist",
        publicCode,
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        comment: null,
        size: "standard",
        language: "EN",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    printingIds.push(printing.id);
    return printing.id;
  }

  /**
   * Attaches a front image; `rehosted: false` leaves only an external URL.
   *
   * @returns The created image file id.
   */
  async function addImage(
    printingId: string,
    { rehosted = true, active = true } = {},
  ): Promise<string> {
    counter += 1;
    const imageFile = await db
      .insertInto("imageFiles")
      .values({
        rehostedUrl: rehosted ? `https://images.example.com/cover-itest-${counter}.webp` : null,
        originalUrl: rehosted ? null : `https://images.example.com/cover-itest-${counter}.png`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    imageFileIds.push(imageFile.id);
    await db
      .insertInto("printingImages")
      .values({ printingId, imageFileId: imageFile.id, face: "front", isActive: active })
      .execute();
    return imageFile.id;
  }

  async function makeProduct(name: string, contentPrintingIds: string[]): Promise<string> {
    counter += 1;
    const product = await repos.products.create({
      slug: `cover-itest-product-${counter}`,
      name,
      description: null,
      setId: null,
    });
    productIds.push(product.id);
    await repos.products.replaceContents(
      product.id,
      contentPrintingIds.map((printingId) => ({ printingId, quantity: 1 })),
    );
    return product.id;
  }

  // The main product exercises ordering, dedupe, exclusions, and the limit in
  // one pass; ids are captured for the assertions below.
  let kitId: string;
  let legendPrintingId: string;
  let legendImageId: string;
  let showcasePrintingId: string;
  let epicPrintingId: string;
  let rarePrintingId: string;

  beforeAll(async () => {
    const legendCard = await makeCard("Cover Legend", "legend");
    const dualVariantCard = await makeCard("Cover Dual Variant", "unit");
    const epicCard = await makeCard("Cover Epic", "unit");
    const rareCard = await makeCard("Cover Rare", "unit");
    const commonCard = await makeCard("Cover Common", "unit");
    const battlefieldCard = await makeCard("Cover Battlefield", "battlefield");
    const unhostedCard = await makeCard("Cover Unhosted", "unit");
    const inactiveCard = await makeCard("Cover Inactive", "unit");
    await syncCardCardTypes(db);

    legendPrintingId = await makePrinting(legendCard, "rare", "COV-100");
    legendImageId = await addImage(legendPrintingId);
    // Same card twice: the showcase variant must win and appear only once.
    const dualCommonPrinting = await makePrinting(dualVariantCard, "common", "COV-110");
    await addImage(dualCommonPrinting);
    showcasePrintingId = await makePrinting(dualVariantCard, "showcase", "COV-111");
    await addImage(showcasePrintingId);
    epicPrintingId = await makePrinting(epicCard, "epic", "COV-120");
    await addImage(epicPrintingId);
    rarePrintingId = await makePrinting(rareCard, "rare", "COV-130");
    await addImage(rarePrintingId);
    const commonPrinting = await makePrinting(commonCard, "common", "COV-140");
    await addImage(commonPrinting);
    const battlefieldPrinting = await makePrinting(battlefieldCard, "epic", "COV-150");
    await addImage(battlefieldPrinting);
    const unhostedPrinting = await makePrinting(unhostedCard, "epic", "COV-160");
    await addImage(unhostedPrinting, { rehosted: false });
    const inactivePrinting = await makePrinting(inactiveCard, "epic", "COV-170");
    await addImage(inactivePrinting, { active: false });

    kitId = await makeProduct("Cover Ordering Kit", [
      dualCommonPrinting,
      showcasePrintingId,
      commonPrinting,
      rarePrintingId,
      epicPrintingId,
      legendPrintingId,
      battlefieldPrinting,
      unhostedPrinting,
      inactivePrinting,
    ]);
  });

  afterAll(async () => {
    if (productIds.length > 0) {
      await db.deleteFrom("products").where("id", "in", productIds).execute();
    }
    if (printingIds.length > 0) {
      await db.deleteFrom("printingImages").where("printingId", "in", printingIds).execute();
      await db.deleteFrom("printings").where("id", "in", printingIds).execute();
    }
    if (imageFileIds.length > 0) {
      await db.deleteFrom("imageFiles").where("id", "in", imageFileIds).execute();
    }
    if (cardIds.length > 0) {
      await db.deleteFrom("cards").where("id", "in", cardIds).execute();
    }
  });

  it("ranks legends first, then rarity, dedupes variants, and caps at four", async () => {
    const rows = await repos.products.coverCards([kitId]);

    // Legend leads despite its mid rarity; then units by rarity descending.
    // The common variant of the dual-variant card is folded into its showcase
    // printing; the common-only card is cut by the limit; battlefield,
    // unhosted, and inactive-image cards never qualify.
    expect(rows.map((row) => row.printingId)).toEqual([
      legendPrintingId,
      showcasePrintingId,
      epicPrintingId,
      rarePrintingId,
    ]);
    expect(rows[0]).toEqual({
      productId: kitId,
      printingId: legendPrintingId,
      imageId: legendImageId,
      name: "Cover Legend",
    });
  });

  it("groups rows per product across a batched lookup", async () => {
    const soloId = await makeProduct("Cover Solo Box", [epicPrintingId]);

    const rows = await repos.products.coverCards([kitId, soloId]);

    const byProduct = Map.groupBy(rows, (row) => row.productId);
    expect(byProduct.get(kitId)).toHaveLength(4);
    expect(byProduct.get(soloId)?.map((row) => row.printingId)).toEqual([epicPrintingId]);
  });

  it("returns an empty array for products without images and for no ids", async () => {
    const bareId = await makeProduct("Cover Bare Box", []);

    expect(await repos.products.coverCards([bareId])).toEqual([]);
    expect(await repos.products.coverCards([])).toEqual([]);
  });
});

describe.skipIf(!ctx)("products repo set grouping (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repos = createRepos(db);

  const productIds: string[] = [];
  const setIds: string[] = [];
  let counter = 0;

  async function makeSet(name: string, sortOrder: number): Promise<string> {
    counter += 1;
    const set = await db
      .insertInto("sets")
      .values({ slug: `set-itest-${counter}`, name, printedTotal: null, sortOrder })
      .returning("id")
      .executeTakeFirstOrThrow();
    setIds.push(set.id);
    return set.id;
  }

  async function makeProduct(name: string, setId: string | null): Promise<string> {
    counter += 1;
    const product = await repos.products.create({
      slug: `set-itest-product-${counter}`,
      name,
      description: null,
      setId,
    });
    productIds.push(product.id);
    return product.id;
  }

  afterAll(async () => {
    if (productIds.length > 0) {
      await db.deleteFrom("products").where("id", "in", productIds).execute();
    }
    if (setIds.length > 0) {
      await db.deleteFrom("sets").where("id", "in", setIds).execute();
    }
  });

  it("orders by set sort order, then name, with set-less products last", async () => {
    // High sort orders keep fixture sets out of the way.
    const laterSetId = await makeSet("Itest Later Wave", 902);
    const earlierSetId = await makeSet("Itest Earlier Wave", 901);
    const laterProductId = await makeProduct("Aaa Later Kit", laterSetId);
    const noSetProductId = await makeProduct("Aaa Setless Bundle", null);
    const earlierBId = await makeProduct("Bbb Earlier Kit", earlierSetId);
    const earlierAId = await makeProduct("Aaa Earlier Kit", earlierSetId);

    const rows = await repos.products.listWithCounts();
    const mine = rows.filter((row) => productIds.includes(row.id));

    expect(mine.map((row) => row.id)).toEqual([
      earlierAId,
      earlierBId,
      laterProductId,
      noSetProductId,
    ]);
  });

  it("joins the set slug and name, null for set-less products", async () => {
    const setId = await makeSet("Itest Join Wave", 904);
    const withSetId = await makeProduct("Join Kit", setId);
    const withoutSetId = await makeProduct("Join Setless Kit", null);

    const rows = await repos.products.listWithCounts();
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(withSetId)).toMatchObject({ setId, setName: "Itest Join Wave" });
    expect(byId.get(withSetId)?.setSlug).toMatch(/^set-itest-/u);
    expect(byId.get(withoutSetId)).toMatchObject({ setId: null, setSlug: null, setName: null });
  });

  it("updates a product's set and reads it back with counts", async () => {
    const setId = await makeSet("Itest Patch Wave", 903);
    const productId = await makeProduct("Patchable Kit", null);

    await repos.products.update(productId, { setId });
    const updated = await repos.products.getByIdWithCounts(productId);
    expect(updated).toMatchObject({ setId, setName: "Itest Patch Wave" });

    await repos.products.update(productId, { setId: null });
    const cleared = await repos.products.getByIdWithCounts(productId);
    expect(cleared).toMatchObject({ setId: null, setSlug: null, setName: null });
  });

  it("returns slug + ISO updatedAt for every product in the sitemap feed", async () => {
    const productId = await makeProduct("Sitemap Kit", null);
    const created = await repos.products.getByIdWithCounts(productId);

    const entries = await repos.products.allSitemapEntries();
    const mine = entries.find((entry) => entry.slug === created?.slug);

    expect(mine).toBeDefined();
    expect(mine?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u);
    // Every catalogued product belongs in the sitemap: no draft/publish gate,
    // so each fixture product created above has an entry.
    const slugs = new Set(entries.map((entry) => entry.slug));
    const fixtures = await Promise.all(
      productIds.map((id) => repos.products.getByIdWithCounts(id)),
    );
    for (const fixture of fixtures) {
      expect(slugs.has(fixture?.slug ?? "")).toBe(true);
    }
  });
});
