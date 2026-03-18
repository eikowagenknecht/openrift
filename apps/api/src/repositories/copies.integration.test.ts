import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { collectionsRepo } from "./collections.js";
import { copiesRepo } from "./copies.js";

const ctx = createDbContext("a0000000-0027-4000-a000-000000000001");

describe.skipIf(!ctx)("copiesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);

  // Seed printing IDs from the OGS set
  const printingId1 = "019cf052-e020-7222-b8bf-3c9fc2151abc"; // OGS-001
  const printingId2 = "019cf052-e01f-7f65-8d7a-a28fddcf5d61"; // OGS-002
  const printingId3 = "019cf052-e020-7228-9093-13d47b91b4d9"; // OGS-003

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
      { userId, printingId: printingId1, collectionId, sourceId: null },
      { userId, printingId: printingId2, collectionId, sourceId: null },
      { userId, printingId: printingId3, collectionId, sourceId: null },
    ]);
    for (const row of inserted) {
      insertedCopyIds.push(row.id);
    }

    expect(inserted).toHaveLength(3);
    expect(inserted[0].collectionId).toBe(collectionId);

    const list = await copies.listForCollection(collectionId);
    expect(list.length).toBeGreaterThanOrEqual(3);

    // Verify denormalized fields are present
    for (const copy of list) {
      expect(copy.cardName).toBeDefined();
      expect(copy.cardType).toBeDefined();
      expect(copy.setId).toBeDefined();
      expect(copy.rarity).toBeDefined();
      expect(copy.collectorNumber).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists all copies for a user", async () => {
    const list = await copies.listForUser(userId);
    expect(list.length).toBeGreaterThanOrEqual(3);

    // All copies should belong to this user (verified by the where clause)
    for (const copy of list) {
      expect(copy.cardName).toBeDefined();
    }
  });

  it("returns empty for a user with no copies", async () => {
    const result = await copies.listForUser("a0000000-9999-4000-a000-000000000001");
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
    expect(result!.cardName).toBeDefined();
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
  // listByIdsForUser
  // ---------------------------------------------------------------------------

  it("returns copies by ids for the owning user", async () => {
    const ids = insertedCopyIds.slice(0, 2);
    const result = await copies.listByIdsForUser(ids, userId);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual([...ids].sort());
  });

  it("listByIdsForUser returns empty for wrong user", async () => {
    const result = await copies.listByIdsForUser(
      insertedCopyIds,
      "a0000000-9999-4000-a000-000000000001",
    );
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // countByPrintingForUser
  // ---------------------------------------------------------------------------

  it("returns counts grouped by printingId", async () => {
    const counts = await copies.countByPrintingForUser(userId);
    expect(counts.length).toBeGreaterThanOrEqual(1);

    for (const row of counts) {
      expect(row.printingId).toBeDefined();
      expect(row.count).toBeGreaterThanOrEqual(1);
    }
  });

  it("countByPrintingForUser returns empty for user with no copies", async () => {
    const result = await copies.countByPrintingForUser("a0000000-9999-4000-a000-000000000001");
    expect(result).toEqual([]);
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
      { userId, printingId: printingId1, collectionId, sourceId: null },
    ]);

    await copies.deleteBatch([toDelete.id], userId);

    const result = await copies.existsForUser(toDelete.id, userId);
    expect(result).toBeUndefined();
  });
});
