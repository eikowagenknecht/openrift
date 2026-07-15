import { afterAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { CARDS, PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";

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
