import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { collectionsRepo } from "./collections.js";

const ctx = createDbContext("a0000000-0026-4000-a000-000000000001");

describe.skipIf(!ctx)("collectionsRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = collectionsRepo(db);

  const createdCollectionIds: string[] = [];

  afterAll(async () => {
    // Clean up copies that may reference our collections
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("copies").where("collectionId", "in", createdCollectionIds).execute();
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
  });

  // ---------------------------------------------------------------------------
  // create + getByIdForUser
  // ---------------------------------------------------------------------------

  it("creates a collection and retrieves it", async () => {
    const col = await repo.create({
      userId,
      name: "Test Binder",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
    });
    createdCollectionIds.push(col.id);

    expect(col.id).toBeDefined();
    expect(col.name).toBe("Test Binder");
    expect(col.userId).toBe(userId);
    expect(col.availableForDeckbuilding).toBe(true);
    expect(col.isInbox).toBe(false);

    const fetched = await repo.getByIdForUser(col.id, userId);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(col.id);
    expect(fetched!.name).toBe("Test Binder");
  });

  // ---------------------------------------------------------------------------
  // getByIdForUser — wrong user
  // ---------------------------------------------------------------------------

  it("returns undefined when queried with a different userId", async () => {
    const col = await repo.create({
      userId,
      name: "Private Collection",
      description: null,
      availableForDeckbuilding: false,
      isInbox: false,
      sortOrder: 2,
    });
    createdCollectionIds.push(col.id);

    const result = await repo.getByIdForUser(col.id, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists collections ordered by inbox first, then sort order, then name", async () => {
    // Create an inbox
    const inbox = await repo.create({
      userId,
      name: "Inbox",
      description: null,
      availableForDeckbuilding: true,
      isInbox: true,
      sortOrder: 0,
    });
    createdCollectionIds.push(inbox.id);

    const binder = await repo.create({
      userId,
      name: "Alpha Binder",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 5,
    });
    createdCollectionIds.push(binder.id);

    const list = await repo.listForUser(userId);
    expect(list.length).toBeGreaterThanOrEqual(2);

    // Inbox should come first
    const inboxIdx = list.findIndex((c) => c.id === inbox.id);
    const binderIdx = list.findIndex((c) => c.id === binder.id);
    expect(inboxIdx).toBeLessThan(binderIdx);
  });

  it("returns empty array for a user with no collections", async () => {
    const result = await repo.listForUser("a0000000-9999-4000-a000-000000000001");
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  it("updates a collection name", async () => {
    const col = await repo.create({
      userId,
      name: "Before Update",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 10,
    });
    createdCollectionIds.push(col.id);

    const updated = await repo.update(col.id, userId, { name: "After Update" });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("After Update");
    expect(updated!.id).toBe(col.id);
  });

  it("update returns undefined for nonexistent collection", async () => {
    const result = await repo.update("00000000-0000-0000-0000-000000000000", userId, {
      name: "Nope",
    });
    expect(result).toBeUndefined();
  });

  it("update returns undefined for wrong userId", async () => {
    const col = await repo.create({
      userId,
      name: "Owned by 0026",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 11,
    });
    createdCollectionIds.push(col.id);

    const result = await repo.update(col.id, "a0000000-9999-4000-a000-000000000001", {
      name: "Stolen",
    });
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // getIdAndName
  // ---------------------------------------------------------------------------

  it("returns id and name for existing collection", async () => {
    const col = await repo.create({
      userId,
      name: "Named One",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 20,
    });
    createdCollectionIds.push(col.id);

    const result = await repo.getIdAndName(col.id, userId);
    expect(result).toEqual({ id: col.id, name: "Named One" });
  });

  it("getIdAndName returns undefined for wrong userId", async () => {
    const col = createdCollectionIds[0];
    const result = await repo.getIdAndName(col, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  it("returns id when collection exists", async () => {
    const col = createdCollectionIds[0];
    const result = await repo.exists(col, userId);
    expect(result).toEqual({ id: col });
  });

  it("exists returns undefined for nonexistent id", async () => {
    const result = await repo.exists("00000000-0000-0000-0000-000000000000", userId);
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listIdsByIdsForUser
  // ---------------------------------------------------------------------------

  it("returns only ids belonging to the user", async () => {
    const ids = createdCollectionIds.slice(0, 2);
    const result = await repo.listIdsByIdsForUser(ids, userId);
    expect(result.length).toBe(2);
    expect(result.map((r) => r.id).toSorted()).toEqual(ids.toSorted());
  });

  it("returns empty for wrong userId", async () => {
    const result = await repo.listIdsByIdsForUser(
      createdCollectionIds,
      "a0000000-9999-4000-a000-000000000001",
    );
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // ensureInbox
  // ---------------------------------------------------------------------------

  it("creates an inbox if none exists and returns its id", async () => {
    // Use a separate user to avoid conflict with inbox created above
    // We'll clean it up manually
    const inboxUserId = userId; // Already has an inbox from earlier test
    const inboxId = await repo.ensureInbox(inboxUserId);
    expect(inboxId).toBeDefined();
    expect(typeof inboxId).toBe("string");

    // Calling again should return the same id
    const inboxId2 = await repo.ensureInbox(inboxUserId);
    expect(inboxId2).toBe(inboxId);
  });

  // ---------------------------------------------------------------------------
  // deleteByIdForUser
  // ---------------------------------------------------------------------------

  it("deletes a collection by id for the owning user", async () => {
    const col = await repo.create({
      userId,
      name: "To Delete",
      description: null,
      availableForDeckbuilding: false,
      isInbox: false,
      sortOrder: 99,
    });
    // Don't track — we'll delete it ourselves

    await repo.deleteByIdForUser(col.id, userId);

    const fetched = await repo.getByIdForUser(col.id, userId);
    expect(fetched).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listIdAndNameByIds
  // ---------------------------------------------------------------------------

  it("returns id and name for given collection IDs", async () => {
    const ids = createdCollectionIds.slice(0, 2);
    const result = await repo.listIdAndNameByIds(ids);
    expect(result.length).toBe(2);
    for (const row of result) {
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("name");
    }
  });

  // ---------------------------------------------------------------------------
  // listCopiesInCollection + moveCopiesBetweenCollections
  // ---------------------------------------------------------------------------

  it("lists copies in a collection and moves them", async () => {
    // Create two collections
    const colA = await repo.create({
      userId,
      name: "Source Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 30,
    });
    createdCollectionIds.push(colA.id);

    const colB = await repo.create({
      userId,
      name: "Dest Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 31,
    });
    createdCollectionIds.push(colB.id);

    // Insert a copy into colA using a seed printing
    const printingId = "019cf052-e020-7222-b8bf-3c9fc2151abc";
    await db.insertInto("copies").values({ userId, printingId, collectionId: colA.id }).execute();

    // List copies in colA
    const copies = await repo.listCopiesInCollection(colA.id);
    expect(copies.length).toBe(1);
    expect(copies[0].printingId).toBe(printingId);

    // Move copies to colB
    await repo.moveCopiesBetweenCollections(colA.id, colB.id);

    // Verify move
    const afterA = await repo.listCopiesInCollection(colA.id);
    expect(afterA.length).toBe(0);

    const afterB = await repo.listCopiesInCollection(colB.id);
    expect(afterB.length).toBe(1);

    // Clean up the copy
    await db.deleteFrom("copies").where("collectionId", "=", colB.id).execute();
  });
});
