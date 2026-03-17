import { describe, expect, it } from "vitest";

import { activitiesRepo } from "./activities.js";

// ---------------------------------------------------------------------------
// Mock DB — tracks calls to verify the repo builds correct queries
// ---------------------------------------------------------------------------

interface CallLog {
  method: string;
  args: unknown[];
}

function createMockDb(returnValue: unknown = []) {
  const calls: CallLog[] = [];

  function log(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  const chain: Record<string, (...args: unknown[]) => unknown> = {};

  for (const method of [
    "selectAll",
    "select",
    "where",
    "orderBy",
    "limit",
    "innerJoin",
    "leftJoin",
  ]) {
    chain[method] = (...args: unknown[]) => {
      log(method, ...args);
      return chain;
    };
  }

  chain.execute = () => {
    log("execute");
    return returnValue;
  };

  chain.executeTakeFirst = () => {
    log("executeTakeFirst");
    return Array.isArray(returnValue) ? (returnValue[0] ?? undefined) : returnValue;
  };

  const db = {
    selectFrom: (table: string) => {
      log("selectFrom", table);
      return chain;
    },
  };

  return { db, calls };
}

// ---------------------------------------------------------------------------
// listForUser
// ---------------------------------------------------------------------------

describe("activitiesRepo.listForUser", () => {
  it("fetches activities without cursor", async () => {
    const data = [{ id: "a1", userId: "u1", createdAt: new Date() }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.listForUser("u1", 10);

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["activities"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["createdAt", "desc"] },
      { method: "limit", args: [11] },
      { method: "execute", args: [] },
    ]);
  });

  it("adds cursor WHERE clause when cursor is provided", async () => {
    const cursorDate = "2026-01-15T00:00:00.000Z";
    const { db, calls } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    await repo.listForUser("u1", 5, cursorDate);

    expect(calls).toEqual([
      { method: "selectFrom", args: ["activities"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["createdAt", "desc"] },
      { method: "limit", args: [6] },
      { method: "where", args: ["createdAt", "<", new Date(cursorDate)] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when no activities exist", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.listForUser("u1", 10);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("activitiesRepo.getByIdForUser", () => {
  it("returns the activity when it exists", async () => {
    const data = [{ id: "a1", userId: "u1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.getByIdForUser("a1", "u1");

    expect(result).toEqual({ id: "a1", userId: "u1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["activities"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "a1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// itemsWithDetails
// ---------------------------------------------------------------------------

describe("activitiesRepo.itemsWithDetails", () => {
  it("builds the correct multi-table join query", async () => {
    const data = [
      {
        id: "item1",
        activityId: "a1",
        activityType: "import",
        copyId: "cp1",
        printingId: "pr1",
        action: "add",
        fromCollectionId: null,
        fromCollectionName: null,
        toCollectionId: "col1",
        toCollectionName: "Inbox",
        metadataSnapshot: null,
        createdAt: new Date(),
        imageUrl: "https://example.com/img.jpg",
        setId: "set1",
        collectorNumber: "001",
        rarity: "common",
        cardName: "Fire Dragon",
        cardType: "creature",
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.itemsWithDetails("a1", "u1");

    expect(result).toEqual(data);

    // Verify the query chain: selectFrom, innerJoin x3, leftJoin, select, where x2, orderBy x2, execute
    expect(calls[0]).toEqual({ method: "selectFrom", args: ["activityItems as ai"] });
    expect(calls[1]).toEqual({
      method: "innerJoin",
      args: ["activities as a", "a.id", "ai.activityId"],
    });
    expect(calls[2]).toEqual({
      method: "innerJoin",
      args: ["printings as p", "p.id", "ai.printingId"],
    });
    expect(calls[3]).toEqual({
      method: "innerJoin",
      args: ["cards as card", "card.id", "p.cardId"],
    });
    // leftJoin uses a callback — we just verify it was called
    expect(calls[4].method).toBe("leftJoin");
    expect(calls[4].args[0]).toBe("printingImages as pi");
    // select with the column list
    expect(calls[5].method).toBe("select");
    // where clauses
    expect(calls[6]).toEqual({
      method: "where",
      args: ["ai.activityId", "=", "a1"],
    });
    expect(calls[7]).toEqual({
      method: "where",
      args: ["a.userId", "=", "u1"],
    });
    // orderBy clauses
    expect(calls[8]).toEqual({ method: "orderBy", args: ["ai.createdAt"] });
    expect(calls[9]).toEqual({ method: "orderBy", args: ["ai.id"] });
    expect(calls[10]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array when activity has no items", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = activitiesRepo(db as any);

    const result = await repo.itemsWithDetails("nonexistent", "u1");

    expect(result).toEqual([]);
  });
});
