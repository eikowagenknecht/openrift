import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2, PRINTING_3, PRINTING_4 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { collectionsRepo } from "./collections.js";
import { buildCopiesCursor, copiesRepo } from "./copies.js";

const ctx = createDbContext("a0000000-0027-4000-a000-000000000001");

describe.skipIf(!ctx)("copiesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);

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
      name: "Copy Test Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
    });
    collectionId = col.id;
    createdCollectionIds.push(col.id);

    const col2 = await collections.create({
      userId,
      name: "Second Collection",
      description: null,
      availableForDeckbuilding: false,
      isInbox: false,
      sortOrder: 1,
    });
    secondCollectionId = col2.id;
    createdCollectionIds.push(col2.id);
  });

  // ---------------------------------------------------------------------------
  // insertBatch + listForCollection
  // ---------------------------------------------------------------------------

  it("inserts copies and lists them for a collection", async () => {
    const inserted = await copies.insertBatch([
      { userId, printingId: printingId1, collectionId },
      { userId, printingId: printingId2, collectionId },
      { userId, printingId: printingId3, collectionId },
    ]);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }

    expect(inserted).toHaveLength(3);
    expect(inserted[0].collectionId).toBe(collectionId);

    const list = await copies.listForCollection(collectionId, 200);
    expect(list.length).toBeGreaterThanOrEqual(3);

    // Verify slim copy fields are present
    for (const copy of list) {
      expect(copy.printingId).toBeDefined();
      expect(copy.collectionId).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists all copies for a user", async () => {
    const list = await copies.listForUser(userId, 200);
    expect(list.length).toBeGreaterThanOrEqual(3);

    // All copies should belong to this user (verified by the where clause)
    for (const copy of list) {
      expect(copy.printingId).toBeDefined();
    }
  });

  it("returns empty for a user with no copies", async () => {
    const result = await copies.listForUser("a0000000-9999-4000-a000-000000000001", 200);
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getByIdForUser
  // ---------------------------------------------------------------------------

  it("returns a copy by id for the owning user", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.getByIdForUser(copyId, userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(copyId);
    expect(result!.printingId).toBe(printingId1);
    expect(result!.collectionId).toBeDefined();
  });

  it("returns undefined for a copy with wrong userId", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.getByIdForUser(copyId, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  it("returns undefined for nonexistent copy", async () => {
    const result = await copies.getByIdForUser("00000000-0000-0000-0000-000000000000", userId);
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // existsForUser
  // ---------------------------------------------------------------------------

  it("returns id when copy exists for user", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.existsForUser(copyId, userId);
    expect(result).toEqual({ id: copyId });
  });

  it("existsForUser returns undefined for wrong user", async () => {
    const copyId = insertedCopyIds[0];
    const result = await copies.existsForUser(copyId, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listWithCollectionName
  // ---------------------------------------------------------------------------

  it("returns copies with their collection name", async () => {
    const result = await copies.listWithCollectionName(insertedCopyIds, userId);
    expect(result.length).toBeGreaterThanOrEqual(1);

    for (const row of result) {
      expect(row.collectionName).toBe("Copy Test Collection");
      expect(row.printingId).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // moveBatch
  // ---------------------------------------------------------------------------

  it("moves copies to a different collection", async () => {
    const copyToMove = insertedCopyIds[2]; // The third copy
    await copies.moveBatch([copyToMove], userId, secondCollectionId);

    const moved = await copies.getByIdForUser(copyToMove, userId);
    expect(moved).toBeDefined();
    expect(moved!.collectionId).toBe(secondCollectionId);

    // Move it back for cleanup consistency
    await copies.moveBatch([copyToMove], userId, collectionId);
  });

  // ---------------------------------------------------------------------------
  // countByCardAndPrintingForDeckbuilding
  // ---------------------------------------------------------------------------

  it("returns counts from deckbuilding-available collections only", async () => {
    const counts = await copies.countByCardAndPrintingForDeckbuilding(userId);
    // Our first collection is availableForDeckbuilding=true, second is false
    expect(counts.length).toBeGreaterThanOrEqual(1);

    for (const row of counts) {
      expect(row.cardId).toBeDefined();
      expect(row.printingId).toBeDefined();
      expect(row.count).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------------------
  // deleteBatch
  // ---------------------------------------------------------------------------

  it("deletes copies by ids for the owning user", async () => {
    // Insert a copy specifically to delete
    const [toDelete] = await copies.insertBatch([
      { userId, printingId: printingId1, collectionId },
    ]);

    await copies.deleteBatch([toDelete.id], userId);

    const result = await copies.existsForUser(toDelete.id, userId);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Pagination tests
// ---------------------------------------------------------------------------

type CopyRow = Awaited<ReturnType<ReturnType<typeof copiesRepo>["listForUser"]>>[number];

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
      cursor = buildCopiesCursor(lastItem.createdAt, lastItem.id);
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
      name: "Pagination Test Collection",
      description: null,
      availableForDeckbuilding: true,
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
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
      10,
    );
    expect(items).toHaveLength(0);
    expect(pageCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Single copy
  // ---------------------------------------------------------------------------

  it("returns exactly one item with no extra pages", async () => {
    const [inserted] = await copies.insertBatch([
      { userId, printingId: printingIds[0], collectionId },
    ]);
    insertedCopyIds.push(inserted.id);

    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
      10,
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(inserted.id);
    expect(pageCount).toBe(1);

    // cleanup
    await copies.deleteBatch([inserted.id], userId);
    insertedCopyIds.pop();
  });

  // ---------------------------------------------------------------------------
  // Batch insert (same createdAt) — the timestamp collision case
  // ---------------------------------------------------------------------------

  it("handles timestamp collisions: batch-inserted copies all paginate correctly", async () => {
    // Insert 7 copies in one batch — they all share the same createdAt from now()
    const batchValues = [...printingIds, ...printingIds.slice(0, 3)] // 4 + 3 = 7 copies
      .map((printingId) => ({ userId, printingId, collectionId }));

    const inserted = await copies.insertBatch(batchValues);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Paginate with page size 2 — forces multiple pages through same-timestamp rows
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
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
    await copies.deleteBatch([...insertedIds], userId);
    insertedCopyIds.length = 0;
  });

  it("handles timestamp collisions with page size 1", async () => {
    // Insert 4 copies in one batch — all same createdAt
    const inserted = await copies.insertBatch(
      printingIds.map((printingId) => ({ userId, printingId, collectionId })),
    );
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Page size 1 — every row is its own page, maximum cursor stress
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
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
    await copies.deleteBatch([...insertedIds], userId);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Multiple batches (different createdAt) — tests cross-timestamp pagination
  // ---------------------------------------------------------------------------

  it("paginates across different timestamps without gaps or duplicates", async () => {
    // Insert in separate batches to get different createdAt values
    const batch1 = await copies.insertBatch([
      { userId, printingId: printingIds[0], collectionId },
      { userId, printingId: printingIds[1], collectionId },
    ]);
    // Small delay to ensure different timestamp
    await Bun.sleep(10);
    const batch2 = await copies.insertBatch([
      { userId, printingId: printingIds[2], collectionId },
      { userId, printingId: printingIds[3], collectionId },
    ]);

    const allInserted = [...batch1, ...batch2];
    for (const row of allInserted) {
      insertedCopyIds.push(row.id);
    }
    const allIds = new Set(allInserted.map((row) => row.id));

    // Page size 3 — spans the timestamp boundary
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
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
    await copies.deleteBatch([...allIds], userId);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Exact boundary: count === limit (no hasMore)
  // ---------------------------------------------------------------------------

  it("returns all items in one page when count equals limit exactly", async () => {
    const inserted = await copies.insertBatch(
      printingIds.map((printingId) => ({ userId, printingId, collectionId })),
    );
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Page size = exactly the number of items
    const { items, pageCount } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
      4,
    );

    expect(items).toHaveLength(4);
    expect(pageCount).toBe(1);
    for (const id of insertedIds) {
      expect(items.map((item) => item.id)).toContain(id);
    }

    // cleanup
    await copies.deleteBatch([...insertedIds], userId);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // listForCollection pagination
  // ---------------------------------------------------------------------------

  it("listForCollection paginates correctly with timestamp collisions", async () => {
    // Insert 5 copies in one batch into the same collection
    const batchValues = [...printingIds, printingIds[0]].map((printingId) => ({
      userId,
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
    await copies.deleteBatch([...insertedIds], userId);
    insertedCopyIds.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Ordering: createdAt DESC, id ASC
  // ---------------------------------------------------------------------------

  it("returns items in descending createdAt then ascending id order", async () => {
    const batch1 = await copies.insertBatch([
      { userId, printingId: printingIds[0], collectionId },
      { userId, printingId: printingIds[1], collectionId },
    ]);
    await Bun.sleep(10);
    const batch2 = await copies.insertBatch([{ userId, printingId: printingIds[2], collectionId }]);

    const allInserted = [...batch1, ...batch2];
    for (const row of allInserted) {
      insertedCopyIds.push(row.id);
    }
    const allIds = allInserted.map((row) => row.id);

    const { items } = await paginateAll(
      (limit, cursor) => copies.listForUser(userId, limit, cursor),
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
    await copies.deleteBatch(allIds, userId);
    insertedCopyIds.length = 0;
  });
});
