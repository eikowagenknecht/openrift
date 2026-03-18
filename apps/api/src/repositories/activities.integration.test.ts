import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { activitiesRepo } from "./activities.js";
import { collectionsRepo } from "./collections.js";

const ctx = createDbContext("a0000000-0025-4000-a000-000000000001");

describe.skipIf(!ctx)("activitiesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = activitiesRepo(db);
  const collections = collectionsRepo(db);

  // Seed printing IDs from the OGS set
  const printingId1 = "019cf052-e020-7222-b8bf-3c9fc2151abc"; // OGS-001
  const printingId2 = "019cf052-e01f-7f65-8d7a-a28fddcf5d61"; // OGS-002

  const createdActivityIds: string[] = [];
  let inboxId: string;

  afterAll(async () => {
    // Clean up activity items first (FK constraint), then activities
    if (createdActivityIds.length > 0) {
      await db.deleteFrom("activityItems").where("activityId", "in", createdActivityIds).execute();
      await db.deleteFrom("activities").where("id", "in", createdActivityIds).execute();
    }
    if (inboxId) {
      await db.deleteFrom("collections").where("id", "=", inboxId).execute();
    }
  });

  it("setup: creates an inbox collection", async () => {
    const col = await collections.create({
      userId,
      name: "Inbox",
      description: null,
      availableForDeckbuilding: true,
      isInbox: true,
      sortOrder: 0,
    });
    inboxId = col.id;
  });

  // ---------------------------------------------------------------------------
  // create + getByIdForUser
  // ---------------------------------------------------------------------------

  it("creates an activity and retrieves it by id", async () => {
    const id = await repo.create({
      userId,
      type: "acquisition",
      name: "Test Import",
      date: new Date(),
      description: null,
      isAuto: false,
    });
    createdActivityIds.push(id);

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");

    const activity = await repo.getByIdForUser(id, userId);
    expect(activity).toBeDefined();
    expect(activity!.id).toBe(id);
    expect(activity!.userId).toBe(userId);
    expect(activity!.type).toBe("acquisition");
    expect(activity!.name).toBe("Test Import");
    expect(activity!.isAuto).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getByIdForUser — wrong user
  // ---------------------------------------------------------------------------

  it("returns undefined when queried with a different userId", async () => {
    const id = await repo.create({
      userId,
      type: "acquisition",
      name: "Private Activity",
      date: new Date(),
      description: null,
      isAuto: true,
    });
    createdActivityIds.push(id);

    const result = await repo.getByIdForUser(id, "a0000000-9999-4000-a000-000000000001");
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists activities for a user, newest first", async () => {
    const id1 = await repo.create({
      userId,
      type: "acquisition",
      name: "First",
      date: new Date("2026-01-01"),
      description: null,
      isAuto: false,
    });
    createdActivityIds.push(id1);

    const id2 = await repo.create({
      userId,
      type: "acquisition",
      name: "Second",
      date: new Date("2026-01-02"),
      description: null,
      isAuto: false,
    });
    createdActivityIds.push(id2);

    const list = await repo.listForUser(userId, 100);
    expect(list.length).toBeGreaterThanOrEqual(2);

    // Verify newest first
    for (let i = 1; i < list.length; i++) {
      expect(new Date(list[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[i].createdAt).getTime(),
      );
    }
  });

  it("returns empty array for a user with no activities", async () => {
    const result = await repo.listForUser("a0000000-9999-4000-a000-000000000001", 10);
    expect(result).toEqual([]);
  });

  it("supports cursor-based pagination", async () => {
    // Fetch the full list and use the oldest createdAt as cursor
    const all = await repo.listForUser(userId, 100);
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Use a cursor that excludes the newest activity
    const cursor = all[0].createdAt.toISOString();
    const page = await repo.listForUser(userId, 100, cursor);

    // All returned items should have createdAt < cursor
    for (const item of page) {
      expect(new Date(item.createdAt).getTime()).toBeLessThan(new Date(cursor).getTime());
    }
  });

  // ---------------------------------------------------------------------------
  // createItems + itemsWithDetails
  // ---------------------------------------------------------------------------

  it("creates activity items and retrieves them with details", async () => {
    const activityId = await repo.create({
      userId,
      type: "acquisition",
      name: "Import with items",
      date: new Date(),
      description: null,
      isAuto: false,
    });
    createdActivityIds.push(activityId);

    await repo.createItems([
      {
        activityId,
        userId,
        activityType: "acquisition",
        copyId: null,
        printingId: printingId1,
        action: "added",
        fromCollectionId: null,
        fromCollectionName: null,
        toCollectionId: inboxId,
        toCollectionName: "Inbox",
        metadataSnapshot: null,
      },
      {
        activityId,
        userId,
        activityType: "acquisition",
        copyId: null,
        printingId: printingId2,
        action: "added",
        fromCollectionId: null,
        fromCollectionName: null,
        toCollectionId: inboxId,
        toCollectionName: "Inbox",
        metadataSnapshot: null,
      },
    ]);

    const items = await repo.itemsWithDetails(activityId, userId);
    expect(items).toHaveLength(2);

    // Verify joined data is present
    for (const item of items) {
      expect(item.activityId).toBe(activityId);
      expect(item.activityType).toBe("acquisition");
      expect(item.action).toBe("added");
      expect(item.cardName).toBeDefined();
      expect(item.cardType).toBeDefined();
      expect(item.setId).toBeDefined();
      expect(item.collectorNumber).toBeDefined();
      expect(item.rarity).toBeDefined();
    }
  });

  it("returns empty array for items with wrong userId", async () => {
    // Use the last created activity
    const activityId = createdActivityIds.at(-1)!;
    const items = await repo.itemsWithDetails(activityId, "a0000000-9999-4000-a000-000000000001");
    expect(items).toEqual([]);
  });

  it("createItems is a no-op for empty array", async () => {
    // Should not throw
    await repo.createItems([]);
  });
});
