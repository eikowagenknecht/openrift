import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OGS_SET,
  PRINTING_1,
  PRINTING_2,
  PRINTING_3,
  PRINTING_4,
} from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { collectionDeckbuildingPrefsRepo } from "./collection-deckbuilding-prefs.js";
import { collectionsRepo } from "./collections.js";
import { copiesRepo } from "./copies.js";
import { buildKeysetCursor } from "./query-helpers.js";

const ctx = createDbContext("a0000000-0027-4000-a000-000000000001");

describe.skipIf(!ctx)("copiesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);
  const deckbuildingPrefs = collectionDeckbuildingPrefsRepo(db);

  // Seed printing IDs from the OGS set
  const printingId1 = PRINTING_1.id; // OGS-001
  const printingId2 = PRINTING_2.id; // OGS-002
  const printingId3 = PRINTING_3.id; // OGS-003

  let collectionId: string;
  let secondCollectionId: string;
  const insertedCopyIds: string[] = [];
  const createdCollectionIds: string[] = [];

  afterAll(async () => {
    // Clean up copies first, then collections
    if (insertedCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", insertedCopyIds).execute();
    }
    // Also clean up any remaining copies in our collections
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("copies").where("collectionId", "in", createdCollectionIds).execute();
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
  });

  // ---------------------------------------------------------------------------
  // Setup: create collections for copies
  // ---------------------------------------------------------------------------

  it("setup: creates collections for copy tests", async () => {
    const col = await collections.create({
      userId,
      groupId: null,
      name: "Copy Test Collection",
      description: null,
      isInbox: false,
      sortOrder: 0,
    });
    collectionId = col.id;
    createdCollectionIds.push(col.id);

    const col2 = await collections.create({
      userId,
      groupId: null,
      name: "Second Collection",
      description: null,
      isInbox: false,
      sortOrder: 1,
    });
    secondCollectionId = col2.id;
    createdCollectionIds.push(col2.id);

    // Deck-building availability is now a per-viewer preference. Personal
    // collections default ON, so opt the second one OUT to mirror the old
    // `availableForDeckbuilding: false` and exercise the prefs path.
    await deckbuildingPrefs.set(userId, secondCollectionId, false);
  });

  // ---------------------------------------------------------------------------
  // insertBatch + listForCollection
  // ---------------------------------------------------------------------------

  it("inserts copies and lists them for a collection", async () => {
    const inserted = await copies.insertBatch([
      { printingId: printingId1, collectionId },
      { printingId: printingId2, collectionId },
      { printingId: printingId3, collectionId },
    ]);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }

    expect(inserted).toHaveLength(3);
    expect(inserted[0].collectionId).toBe(collectionId);

    const list = await copies.listForCollection(collectionId, 200);
    expect(list.length).toBeGreaterThanOrEqual(3);

    // Verify slim copy fields are present; personal collections have no group.
    for (const copy of list) {
      expect(copy.printingId).toBeDefined();
      expect(copy.collectionId).toBeDefined();
      expect(copy.groupId).toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // listForAccessibleCollections
  // ---------------------------------------------------------------------------

  it("lists all copies in the viewer's accessible collections", async () => {
    const list = await copies.listForAccessibleCollections(userId, 200);
    expect(list.length).toBeGreaterThanOrEqual(3);

    for (const copy of list) {
      expect(copy.printingId).toBeDefined();
    }
  });

  it("returns empty for a user with no accessible collections", async () => {
    const result = await copies.listForAccessibleCollections(
      "a0000000-9999-4000-a000-000000000001",
      200,
    );
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // existsForViewer
  // ---------------------------------------------------------------------------

  it("returns id when the copy is in a collection the viewer can access", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.existsForViewer(copyId, userId);
    expect(result).toEqual({ id: copyId });
  });

  it("existsForViewer returns undefined for a user without access", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.existsForViewer(copyId, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listWithCollectionContext
  // ---------------------------------------------------------------------------

  it("returns copies with their collection name", async () => {
    const result = await copies.listWithCollectionContext(insertedCopyIds);
    expect(result.length).toBeGreaterThanOrEqual(1);

    for (const row of result) {
      expect(row.collectionName).toBe("Copy Test Collection");
      expect(row.printingId).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // moveBatchById
  // ---------------------------------------------------------------------------

  it("moves copies to a different collection", async () => {
    const copyToMove = insertedCopyIds[2]; // The third copy
    await copies.moveBatchById([copyToMove], secondCollectionId);

    const inSecond = await copies.listForCollection(secondCollectionId, 200);
    expect(inSecond.map((copy) => copy.id)).toContain(copyToMove);

    // Move it back for cleanup consistency
    await copies.moveBatchById([copyToMove], collectionId);
    const inFirst = await copies.listForCollection(collectionId, 200);
    expect(inFirst.map((copy) => copy.id)).toContain(copyToMove);
  });

  // ---------------------------------------------------------------------------
  // countByCardAndPrintingForDeckbuilding
  // ---------------------------------------------------------------------------

  it("returns counts from the viewer's deck-building-available collections only", async () => {
    const counts = await copies.countByCardAndPrintingForDeckbuilding(userId);
    // The copies live in the first collection (deck-available by default); the
    // second is opted out via a pref but currently holds no copies.
    expect(counts.length).toBeGreaterThanOrEqual(1);

    for (const row of counts) {
      expect(row.cardId).toBeDefined();
      expect(row.printingId).toBeDefined();
      expect(row.count).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------------------
  // deleteBatchById
  // ---------------------------------------------------------------------------

  it("deletes copies by ids", async () => {
    // Insert a copy specifically to delete
    const [toDelete] = await copies.insertBatch([{ printingId: printingId1, collectionId }]);

    await copies.deleteBatchById([toDelete.id]);

    const result = await copies.existsForViewer(toDelete.id, userId);
    expect(result).toBeUndefined();
  });

  it("lockByIds returns only the surviving ids (dispose/reserve serialization)", async () => {
    const inserted = await copies.insertBatch([
      { printingId: printingId1, collectionId },
      { printingId: printingId2, collectionId },
    ]);
    for (const copy of inserted) {
      insertedCopyIds.push(copy.id);
    }
    const [alive, gone] = inserted;
    await copies.deleteBatchById([gone.id]);

    // The live copy is locked and returned; the deleted one drops out, which is
    // how the reserve side detects a copy a concurrent dispose removed.
    const locked = await copies.lockByIds([alive.id, gone.id]);
    expect(locked).toEqual([alive.id]);

    // Empty input never touches the DB.
    expect(await copies.lockByIds([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pagination tests
// ---------------------------------------------------------------------------

type CopyRow = Awaited<
  ReturnType<ReturnType<typeof copiesRepo>["listForAccessibleCollections"]>
>[number];

/**
 * Simulates the route handler pagination loop: fetches limit+1 rows, slices,
 * builds a compound cursor, and repeats until no more pages.
 * @returns All collected items and the number of pages fetched.
 */
async function paginateAll(
  fetcher: (limit: number, cursor?: string) => Promise<CopyRow[]>,
  pageSize: number,
): Promise<{ items: CopyRow[]; pageCount: number }> {
  const allItems: CopyRow[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const rows = await fetcher(pageSize, cursor);
    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    allItems.push(...items);
    pageCount++;

    if (hasMore) {
      const lastItem = items.at(-1)!;
      cursor = buildKeysetCursor(lastItem.createdAt, lastItem.id);
    } else {
      cursor = undefined;
    }
  } while (cursor);

  return { items: allItems, pageCount };
}

const paginationCtx = createDbContext("a0000000-0028-4000-a000-000000000001");

describe.skipIf(!paginationCtx)("copies pagination (integration)", () => {
  const { db, userId } = paginationCtx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);

  const printingIds = [PRINTING_1.id, PRINTING_2.id, PRINTING_3.id, PRINTING_4.id];
  const createdCollectionIds: string[] = [];
  const insertedCopyIds: string[] = [];

  let collectionId: string;

  afterAll(async () => {
    if (insertedCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", insertedCopyIds).execute();
    }
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("copies").where("collectionId", "in", createdCollectionIds).execute();
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
  });

  it("setup: create collection for pagination tests", async () => {
    const col = await collections.create({
      userId,
      groupId: null,
      name: "Pagination Test Collection",
      description: null,
      isInbox: false,
      sortOrder: 0,
    });
    collectionId = col.id;
    createdCollectionIds.push(col.id);
  });

  // ---------------------------------------------------------------------------
  // Empty collection
  // ---------------------------------------------------------------------------

  it("returns zero items when there are no copies", async () => {
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      10,
    );
    expect(items).toHaveLength(0);
    expect(pageCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Single copy
  // ---------------------------------------------------------------------------

  it("returns exactly one item with no extra pages", async () => {
    const [inserted] = await copies.insertBatch([{ printingId: printingIds[0], collectionId }]);
    insertedCopyIds.push(inserted.id);

    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      10,
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(inserted.id);
    expect(pageCount).toBe(1);

    // cleanup
    await copies.deleteBatchById([inserted.id]);
    insertedCopyIds.pop();
  });

  // ---------------------------------------------------------------------------
  // Batch insert (same createdAt) — the timestamp collision case
  // ---------------------------------------------------------------------------

  it("handles timestamp collisions: batch-inserted copies all paginate correctly", async () => {
    // Insert 7 copies in one batch — they all share the same createdAt from now()
    const batchValues = [...printingIds, ...printingIds.slice(0, 3)] // 4 + 3 = 7 copies
      .map((printingId) => ({ printingId, collectionId }));

    const inserted = await copies.insertBatch(batchValues);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Paginate with page size 2 — forces multiple pages through same-timestamp rows
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      2,
    );

    // Verify no missing items
    const paginatedIds = items.map((item) => item.id);
    for (const id of insertedIds) {
      expect(paginatedIds).toContain(id);
    }

    // Verify no duplicates
    expect(new Set(paginatedIds).size).toBe(paginatedIds.length);

    // Verify correct total
    expect(items).toHaveLength(7);

    // Should have taken ceil(7/2) = 4 pages
    expect(pageCount).toBe(4);

    // cleanup
    await copies.deleteBatchById([...insertedIds]);
    insertedCopyIds.length = 0;
  });

  it("handles timestamp collisions with page size 1", async () => {
    // Insert 4 copies in one batch — all same createdAt
    const inserted = await copies.insertBatch(
      printingIds.map((printingId) => ({ printingId, collectionId })),
    );
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Page size 1 — every row is its own page, maximum cursor stress
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      1,
    );

    const paginatedIds = items.map((item) => item.id);
    expect(new Set(paginatedIds).size).toBe(4);
    expect(paginatedIds).toHaveLength(4);
    for (const id of insertedIds) {
      expect(paginatedIds).toContain(id);
    }
    expect(pageCount).toBe(4);

    // cleanup
    await copies.deleteBatchById([...insertedIds]);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Multiple batches (different createdAt) — tests cross-timestamp pagination
  // ---------------------------------------------------------------------------

  it("paginates across different timestamps without gaps or duplicates", async () => {
    // Insert in separate batches to get different createdAt values
    const batch1 = await copies.insertBatch([
      { printingId: printingIds[0], collectionId },
      { printingId: printingIds[1], collectionId },
    ]);
    // Small delay to ensure different timestamp
    await Bun.sleep(10);
    const batch2 = await copies.insertBatch([
      { printingId: printingIds[2], collectionId },
      { printingId: printingIds[3], collectionId },
    ]);

    const allInserted = [...batch1, ...batch2];
    for (const row of allInserted) {
      insertedCopyIds.push(row.id);
    }
    const allIds = new Set(allInserted.map((row) => row.id));

    // Page size 3 — spans the timestamp boundary
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      3,
    );

    const paginatedIds = items.map((item) => item.id);
    expect(new Set(paginatedIds).size).toBe(4);
    expect(paginatedIds).toHaveLength(4);
    for (const id of allIds) {
      expect(paginatedIds).toContain(id);
    }
    expect(pageCount).toBe(2);

    // cleanup
    await copies.deleteBatchById([...allIds]);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Exact boundary: count === limit (no hasMore)
  // ---------------------------------------------------------------------------

  it("returns all items in one page when count equals limit exactly", async () => {
    const inserted = await copies.insertBatch(
      printingIds.map((printingId) => ({ printingId, collectionId })),
    );
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Page size = exactly the number of items
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      4,
    );

    expect(items).toHaveLength(4);
    expect(pageCount).toBe(1);
    for (const id of insertedIds) {
      expect(items.map((item) => item.id)).toContain(id);
    }

    // cleanup
    await copies.deleteBatchById([...insertedIds]);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // listForCollection pagination
  // ---------------------------------------------------------------------------

  it("listForCollection paginates correctly with timestamp collisions", async () => {
    // Insert 5 copies in one batch into the same collection
    const batchValues = [...printingIds, printingIds[0]].map((printingId) => ({
      printingId,
      collectionId,
    }));

    const inserted = await copies.insertBatch(batchValues);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Paginate with page size 2
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForCollection(collectionId, limit, cursor),
      2,
    );

    const paginatedIds = items.map((item) => item.id);
    expect(new Set(paginatedIds).size).toBe(5);
    expect(paginatedIds).toHaveLength(5);
    for (const id of insertedIds) {
      expect(paginatedIds).toContain(id);
    }
    expect(pageCount).toBe(3);

    // cleanup
    await copies.deleteBatchById([...insertedIds]);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Ordering: createdAt DESC, id ASC
  // ---------------------------------------------------------------------------

  it("returns items in descending createdAt then ascending id order", async () => {
    const batch1 = await copies.insertBatch([
      { printingId: printingIds[0], collectionId },
      { printingId: printingIds[1], collectionId },
    ]);
    await Bun.sleep(10);
    const batch2 = await copies.insertBatch([{ printingId: printingIds[2], collectionId }]);

    const allInserted = [...batch1, ...batch2];
    for (const row of allInserted) {
      insertedCopyIds.push(row.id);
    }
    const allIds = allInserted.map((row) => row.id);

    const { items } = await paginateAll(
      (limit, cursor) => copies.listForAccessibleCollections(userId, limit, cursor),
      10,
    );

    // batch2 (newer) should come first
    const batch2Index = items.findIndex((item) => item.id === batch2[0].id);
    const batch1Indices = batch1.map((row) => items.findIndex((item) => item.id === row.id));
    expect(batch2Index).toBeLessThan(Math.min(...batch1Indices));

    // Within the same batch (same createdAt), IDs should be in ascending order
    if (batch1Indices.length === 2) {
      const [idx0, idx1] = batch1Indices;
      const id0 = items[idx0].id;
      const id1 = items[idx1].id;
      if (id0 < id1) {
        expect(idx0).toBeLessThan(idx1);
      } else {
        expect(idx1).toBeLessThan(idx0);
      }
    }

    // cleanup
    await copies.deleteBatchById(allIds);
    insertedCopyIds.length = 0;
  });
});

// ---------------------------------------------------------------------------
// Group (pooled) collection visibility — regression for the bug where copies
// in a group collection were only visible to whoever added them.
// ---------------------------------------------------------------------------

const groupCtx = createDbContext("a0000000-0029-4000-a000-000000000001");

describe.skipIf(!groupCtx)("copies in group collections (integration)", () => {
  const { db, userId } = groupCtx!;
  const copies = copiesRepo(db);

  let groupId: string;
  let pooledCollectionId: string;
  const insertedCopyIds: string[] = [];

  afterAll(async () => {
    if (insertedCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", insertedCopyIds).execute();
    }
    if (pooledCollectionId) {
      await db.deleteFrom("collections").where("id", "=", pooledCollectionId).execute();
    }
    if (groupId) {
      await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    }
  });

  it("a member sees copies in the group's pooled collection they did not add", async () => {
    // Slug must match ^[a-z0-9][a-z0-9-]{2,29}$ and be unique per run.
    const group = await db
      .insertInto("friendGroups")
      .values({ slug: `cp-grp-${Date.now()}`, name: "Copy Group" })
      .returningAll()
      .executeTakeFirstOrThrow();
    groupId = group.id;

    // The viewer is a plain member — they will NOT be the one adding the copy.
    await db.insertInto("friendGroupMembers").values({ groupId, userId, role: "member" }).execute();

    // A group-owned collection (user_id NULL, group_id set).
    const pooled = await db
      .insertInto("collections")
      .values({ groupId, name: "Pooled Box", isInbox: false, sortOrder: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();
    pooledCollectionId = pooled.id;

    // A copy lands in the pooled collection (ownership is the group's; no
    // per-contributor attribution exists anymore).
    const [copy] = await copies.insertBatch([
      { printingId: PRINTING_1.id, collectionId: pooled.id },
    ]);
    insertedCopyIds.push(copy.id);

    // The member sees it through their accessible-collections feed, tagged
    // with the owning group.
    const accessible = await copies.listForAccessibleCollections(userId, 200);
    const found = accessible.find((row) => row.id === copy.id);
    expect(found).toBeDefined();
    expect(found!.groupId).toBe(groupId);
  });
});

// ---------------------------------------------------------------------------
// coverPrintingsAcross — batched cover art for shared-collection thumb stacks
// ---------------------------------------------------------------------------

const coverCtx = createDbContext(crypto.randomUUID());

describe.skipIf(!coverCtx)("copies coverPrintingsAcross (integration)", () => {
  const { db, userId } = coverCtx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);

  const createdCollectionIds: string[] = [];
  const cardIds: string[] = [];
  const printingIds: string[] = [];
  const imageFileIds: string[] = [];
  let counter = 0;

  beforeAll(async () => {
    await seedTestUser(db, { id: userId });
  });

  afterAll(async () => {
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("copies").where("collectionId", "in", createdCollectionIds).execute();
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
    // Dependency order: printingImages -> printings -> cards, then imageFiles.
    if (printingIds.length > 0) {
      await db.deleteFrom("printingImages").where("printingId", "in", printingIds).execute();
      await db.deleteFrom("printings").where("id", "in", printingIds).execute();
    }
    if (cardIds.length > 0) {
      await db.deleteFrom("cards").where("id", "in", cardIds).execute();
    }
    if (imageFileIds.length > 0) {
      await db.deleteFrom("imageFiles").where("id", "in", imageFileIds).execute();
    }
    await db.deleteFrom("users").where("id", "=", userId).execute();
  });

  /** @returns A fresh printing, optionally with a (rehosted) front image. */
  async function makePrinting(
    image: "rehosted" | "unrehosted" | "none",
  ): Promise<{ printingId: string; imageId: string | null }> {
    counter += 1;
    const card = await db
      .insertInto("cards")
      .values({
        slug: `cover-itest-${userId.slice(0, 8)}-${counter}`,
        name: `Cover Test Card ${counter}`,
        type: "unit",
        might: 2,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardIds.push(card.id);
    const printing = await db
      .insertInto("printings")
      .values({
        cardId: card.id,
        setId: OGS_SET.id,
        shortCode: `CVR-${userId.slice(0, 4)}-${counter}`,
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist",
        publicCode: `OGS-8${String(counter).padStart(2, "0")}`,
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
    if (image === "none") {
      return { printingId: printing.id, imageId: null };
    }
    const imageFile = await db
      .insertInto("imageFiles")
      .values({
        rehostedUrl:
          image === "rehosted" ? `https://images.example.com/cover-itest-${counter}.webp` : null,
        originalUrl: `https://images.example.com/cover-itest-orig-${counter}.webp`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    imageFileIds.push(imageFile.id);
    await db
      .insertInto("printingImages")
      .values({ printingId: printing.id, imageFileId: imageFile.id, face: "front", isActive: true })
      .execute();
    return { printingId: printing.id, imageId: image === "rehosted" ? imageFile.id : null };
  }

  it("ranks covers most-copies-first, caps per collection, and batches across collections", async () => {
    const colA = await collections.create({
      userId,
      groupId: null,
      name: "Cover Collection A",
      description: null,
      isInbox: false,
      sortOrder: 0,
    });
    const colB = await collections.create({
      userId,
      groupId: null,
      name: "Cover Collection B",
      description: null,
      isInbox: false,
      sortOrder: 1,
    });
    createdCollectionIds.push(colA.id, colB.id);

    const popular = await makePrinting("rehosted");
    const single = await makePrinting("rehosted");
    const third = await makePrinting("rehosted");
    const imageless = await makePrinting("none");
    const unrehosted = await makePrinting("unrehosted");

    await copies.insertBatch([
      // Collection A: 2× popular, 1× single, 1× third, plus printings that
      // must never surface (no image row / image not rehosted).
      { printingId: popular.printingId, collectionId: colA.id },
      { printingId: popular.printingId, collectionId: colA.id },
      { printingId: single.printingId, collectionId: colA.id },
      { printingId: third.printingId, collectionId: colA.id },
      { printingId: imageless.printingId, collectionId: colA.id },
      { printingId: unrehosted.printingId, collectionId: colA.id },
      // Collection B: one copy of `single` only.
      { printingId: single.printingId, collectionId: colB.id },
    ]);

    const limited = await copies.coverPrintingsAcross([colA.id, colB.id], 2);
    const forA = limited.filter((row) => row.collectionId === colA.id);
    const forB = limited.filter((row) => row.collectionId === colB.id);

    // A: the two-copy printing leads; the cap drops the third printing.
    expect(forA.map((row) => row.printingId)).toHaveLength(2);
    expect(forA[0]).toEqual({
      collectionId: colA.id,
      printingId: popular.printingId,
      imageId: popular.imageId,
    });
    // B gets its own independent slot set.
    expect(forB).toEqual([
      { collectionId: colB.id, printingId: single.printingId, imageId: single.imageId },
    ]);

    // A higher limit surfaces all three imaged printings — and still never
    // the imageless or unrehosted ones.
    const all = await copies.coverPrintingsAcross([colA.id], 10);
    expect(all.map((row) => row.printingId).toSorted()).toEqual(
      [popular.printingId, single.printingId, third.printingId].toSorted(),
    );
  });

  it("returns an empty list for no collections", async () => {
    expect(await copies.coverPrintingsAcross([], 4)).toEqual([]);
  });
});
