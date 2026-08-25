import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { collectionsRepo } from "./collections.js";

const ctx = createDbContext("a0000000-0026-4000-a000-000000000001");

describe.skipIf(!ctx)("collectionsRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = collectionsRepo(db);

  const createdCollectionIds: string[] = [];

  afterAll(async () => {
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("copies").where("collectionId", "in", createdCollectionIds).execute();
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
  });

  it("creates a collection and retrieves it", async () => {
    const col = await repo.create({
      userId,
      groupId: null,
      name: "Test Binder",
      description: null,
      isInbox: false,
      sortOrder: 1,
    });
    createdCollectionIds.push(col.id);

    expect(col.id).toBeDefined();
    expect(col.name).toBe("Test Binder");
    expect(col.userId).toBe(userId);
    expect(col.isInbox).toBe(false);

    const fetched = await repo.getByIdForUser(col.id, userId);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(col.id);
    expect(fetched!.name).toBe("Test Binder");
  });

  it("returns undefined when queried with a different userId", async () => {
    const col = await repo.create({
      userId,
      groupId: null,
      name: "Private Collection",
      description: null,
      isInbox: false,
      sortOrder: 2,
    });
    createdCollectionIds.push(col.id);

    const result = await repo.getByIdForUser(col.id, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  it("lists collections ordered by inbox first, then sort order, then name", async () => {
    const inbox = await repo.create({
      userId,
      groupId: null,
      name: "Inbox",
      description: null,
      isInbox: true,
      sortOrder: 0,
    });
    createdCollectionIds.push(inbox.id);

    const binder = await repo.create({
      userId,
      groupId: null,
      name: "Alpha Binder",
      description: null,
      isInbox: false,
      sortOrder: 5,
    });
    createdCollectionIds.push(binder.id);

    const list = await repo.listForUser(userId);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const inboxIdx = list.findIndex((c) => c.id === inbox.id);
    const binderIdx = list.findIndex((c) => c.id === binder.id);
    expect(inboxIdx).toBeLessThan(binderIdx);
  });

  it("returns empty array for a user with no collections", async () => {
    const result = await repo.listForUser("a0000000-9999-4000-a000-000000000001");
    expect(result).toEqual([]);
  });

  it("updates a collection name", async () => {
    const col = await repo.create({
      userId,
      groupId: null,
      name: "Before Update",
      description: null,
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
      groupId: null,
      name: "Owned by 0026",
      description: null,
      isInbox: false,
      sortOrder: 11,
    });
    createdCollectionIds.push(col.id);

    const result = await repo.update(col.id, "a0000000-9999-4000-a000-000000000001", {
      name: "Stolen",
    });
    expect(result).toBeUndefined();
  });

  it("returns id and name for existing collection", async () => {
    const col = await repo.create({
      userId,
      groupId: null,
      name: "Named One",
      description: null,
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

  it("returns id when collection exists", async () => {
    const col = createdCollectionIds[0];
    const result = await repo.exists(col, userId);
    expect(result).toEqual({ id: col });
  });

  it("exists returns undefined for nonexistent id", async () => {
    const result = await repo.exists("00000000-0000-0000-0000-000000000000", userId);
    expect(result).toBeUndefined();
  });

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

  it("creates an inbox if none exists and returns its id", async () => {
    const inboxUserId = userId; // Already has an inbox from earlier test
    const inboxId = await repo.ensureInbox(inboxUserId);
    expect(inboxId).toBeDefined();
    expect(typeof inboxId).toBe("string");

    const inboxId2 = await repo.ensureInbox(inboxUserId);
    expect(inboxId2).toBe(inboxId);
  });

  it("deletes a collection by id for the owning user", async () => {
    const col = await repo.create({
      userId,
      groupId: null,
      name: "To Delete",
      description: null,
      isInbox: false,
      sortOrder: 99,
    });
    // Not added to createdCollectionIds — deleted directly by this test instead

    await repo.deleteByIdForUser(col.id, userId);

    const fetched = await repo.getByIdForUser(col.id, userId);
    expect(fetched).toBeUndefined();
  });

  it("returns id and name for given collection IDs", async () => {
    const ids = createdCollectionIds.slice(0, 2);
    const result = await repo.listIdAndNameByIds(ids);
    expect(result.length).toBe(2);
    for (const row of result) {
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("name");
    }
  });

  it("lists copies in a collection and moves them", async () => {
    const colA = await repo.create({
      userId,
      groupId: null,
      name: "Source Collection",
      description: null,
      isInbox: false,
      sortOrder: 30,
    });
    createdCollectionIds.push(colA.id);

    const colB = await repo.create({
      userId,
      groupId: null,
      name: "Dest Collection",
      description: null,
      isInbox: false,
      sortOrder: 31,
    });
    createdCollectionIds.push(colB.id);

    const printingId = PRINTING_1.id;
    await db.insertInto("copies").values({ printingId, collectionId: colA.id }).execute();

    const copies = await repo.listCopiesInCollection(colA.id);
    expect(copies.length).toBe(1);
    expect(copies[0].printingId).toBe(printingId);

    await repo.moveCopiesBetweenCollections(colA.id, colB.id);

    const afterA = await repo.listCopiesInCollection(colA.id);
    expect(afterA.length).toBe(0);

    const afterB = await repo.listCopiesInCollection(colB.id);
    expect(afterB.length).toBe(1);

    await db.deleteFrom("copies").where("collectionId", "=", colB.id).execute();
  });
});
