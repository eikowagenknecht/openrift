import { afterAll, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import { AppError } from "../errors.js";
import { PRINTING_1, PRINTING_2, PRINTING_3 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { createProductFromList, resyncProductContents } from "./products.js";

const USER_ID = "a0000000-0197-4000-a000-000000000001";
const ctx = createDbContext(USER_ID);

describe.skipIf(!ctx)("products snapshot service (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db, userId } = ctx!;
  const repos = createRepos(db);
  const transact = createTransact(db);

  const createdListIds: string[] = [];
  const createdProductIds: string[] = [];
  let slugCounter = 0;

  /** @returns A slug unique to this test file run. */
  function nextSlug(): string {
    slugCounter += 1;
    return `products-itest-${slugCounter}`;
  }

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db.deleteFrom("products").where("id", "in", createdProductIds).execute();
    }
    if (createdListIds.length > 0) {
      await db.deleteFrom("lists").where("id", "in", createdListIds).execute();
    }
  });

  async function createPrintingList(entries: { printingId: string; quantity: number }[]) {
    const list = await repos.lists.create({
      userId,
      name: "Products snapshot source",
      intent: "organize",
      kind: "printing",
    });
    createdListIds.push(list.id);
    for (const entry of entries) {
      await repos.lists.createEntry({
        listId: list.id,
        userId,
        kind: "printing",
        cardId: null,
        printingId: entry.printingId,
        copyId: null,
        quantity: entry.quantity,
      });
    }
    return list;
  }

  async function createProduct(entries: { printingId: string; quantity: number }[]) {
    const list = await createPrintingList(entries);
    const product = await createProductFromList(repos, transact, userId, {
      slug: nextSlug(),
      name: "Products Itest Kit",
      listId: list.id,
    });
    createdProductIds.push(product.id);
    return { list, product };
  }

  it("snapshots a printing list's entries with quantities", async () => {
    const { product } = await createProduct([
      { printingId: PRINTING_1.id, quantity: 1 },
      { printingId: PRINTING_2.id, quantity: 3 },
    ]);
    expect(product.printingCount).toBe(2);
    expect(product.cardTotal).toBe(4);

    const contents = await repos.products.contents(product.id);
    const byPrinting = new Map(contents.map((row) => [row.printingId, row.quantity]));
    expect(byPrinting.get(PRINTING_1.id)).toBe(1);
    expect(byPrinting.get(PRINTING_2.id)).toBe(3);

    // Snapshots write no collection events — browsing/creating a product is
    // not collection activity (ADR-015).
    const events = await db
      .selectFrom("collectionEvents")
      .select(db.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    expect(Number(events.count)).toBe(0);
  });

  it("rejects card-kind lists (no printing identity)", async () => {
    const list = await repos.lists.create({
      userId,
      name: "Card-kind list",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(list.id);

    await expect(
      createProductFromList(repos, transact, userId, {
        slug: nextSlug(),
        name: "Should fail",
        listId: list.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects empty printing lists", async () => {
    const list = await createPrintingList([]);
    await expect(
      createProductFromList(repos, transact, userId, {
        slug: nextSlug(),
        name: "Should fail",
        listId: list.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects another user's list", async () => {
    const list = await createPrintingList([{ printingId: PRINTING_1.id, quantity: 1 }]);
    await expect(
      createProductFromList(repos, transact, "a0000000-0197-4000-a000-000000000002", {
        slug: nextSlug(),
        name: "Should fail",
        listId: list.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a taken slug", async () => {
    const { product, list } = await createProduct([{ printingId: PRINTING_1.id, quantity: 1 }]);
    await expect(
      createProductFromList(repos, transact, userId, {
        slug: product.slug,
        name: "Duplicate slug",
        listId: list.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("re-sync wholesale-replaces contents and bumps updated_at", async () => {
    const { product } = await createProduct([{ printingId: PRINTING_1.id, quantity: 2 }]);
    const before = await repos.products.getById(product.id);

    const replacement = await createPrintingList([{ printingId: PRINTING_3.id, quantity: 5 }]);
    await resyncProductContents(repos, transact, userId, product.id, replacement.id);

    const contents = await repos.products.contents(product.id);
    expect(contents).toEqual([{ printingId: PRINTING_3.id, quantity: 5 }]);

    const after = await repos.products.getById(product.id);
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("a failed re-sync leaves prior contents intact", async () => {
    const { product } = await createProduct([{ printingId: PRINTING_1.id, quantity: 2 }]);
    const cardKindList = await repos.lists.create({
      userId,
      name: "Wrong kind",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(cardKindList.id);

    await expect(
      resyncProductContents(repos, transact, userId, product.id, cardKindList.id),
    ).rejects.toBeInstanceOf(AppError);

    const contents = await repos.products.contents(product.id);
    expect(contents).toEqual([{ printingId: PRINTING_1.id, quantity: 2 }]);
  });

  it("deleting the source list leaves the product untouched (pure snapshot)", async () => {
    const { product, list } = await createProduct([{ printingId: PRINTING_2.id, quantity: 1 }]);
    await db.deleteFrom("lists").where("id", "=", list.id).execute();

    const contents = await repos.products.contents(product.id);
    expect(contents).toEqual([{ printingId: PRINTING_2.id, quantity: 1 }]);
  });

  it("deleting a product cascades its contents", async () => {
    const { product } = await createProduct([{ printingId: PRINTING_1.id, quantity: 1 }]);
    const removed = await repos.products.remove(product.id);
    expect(removed).toBe(true);

    const orphans = await db
      .selectFrom("productPrintings")
      .selectAll()
      .where("productId", "=", product.id)
      .execute();
    expect(orphans).toEqual([]);
  });

  it("a printing referenced by a product cannot be deleted", async () => {
    await createProduct([{ printingId: PRINTING_1.id, quantity: 1 }]);
    await expect(
      db.deleteFrom("printings").where("id", "=", PRINTING_1.id).execute(),
    ).rejects.toThrow();
  });

  it("slug rename takes effect immediately, old slug stops resolving", async () => {
    const { product } = await createProduct([{ printingId: PRINTING_1.id, quantity: 1 }]);
    const renamed = nextSlug();
    await repos.products.update(product.id, { slug: renamed });

    expect(await repos.products.getBySlugWithCounts(product.slug)).toBeUndefined();
    const found = await repos.products.getBySlugWithCounts(renamed);
    expect(found?.id).toBe(product.id);
    expect(found?.printingCount).toBe(1);
  });
});
