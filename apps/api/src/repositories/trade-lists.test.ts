import { describe, expect, it } from "bun:test";

import { tradeListsRepo } from "./trade-lists.js";

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
    "values",
    "set",
    "returningAll",
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

  chain.executeTakeFirstOrThrow = () => {
    log("executeTakeFirstOrThrow");
    return Array.isArray(returnValue) ? (returnValue[0] ?? undefined) : returnValue;
  };

  const db = {
    selectFrom: (table: string) => {
      log("selectFrom", table);
      return chain;
    },
    insertInto: (table: string) => {
      log("insertInto", table);
      return chain;
    },
    updateTable: (table: string) => {
      log("updateTable", table);
      return chain;
    },
    deleteFrom: (table: string) => {
      log("deleteFrom", table);
      return chain;
    },
  };

  return { db, calls };
}

// ---------------------------------------------------------------------------
// listForUser
// ---------------------------------------------------------------------------

describe("tradeListsRepo.listForUser", () => {
  it("selects all trade lists for a user ordered by name", async () => {
    const data = [
      { id: "tl1", name: "Haves" },
      { id: "tl2", name: "Wants" },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["tradeLists"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when user has no trade lists", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("tradeListsRepo.getByIdForUser", () => {
  it("returns the trade list when it exists", async () => {
    const data = [{ id: "tl1", userId: "u1", name: "Haves" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.getByIdForUser("tl1", "u1");

    expect(result).toEqual({ id: "tl1", userId: "u1", name: "Haves" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["tradeLists"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "tl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("tradeListsRepo.exists", () => {
  it("returns the id when trade list exists", async () => {
    const data = [{ id: "tl1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.exists("tl1", "u1");

    expect(result).toEqual({ id: "tl1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["tradeLists"] },
      { method: "select", args: ["id"] },
      { method: "where", args: ["id", "=", "tl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.exists("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("tradeListsRepo.create", () => {
  it("inserts a new trade list and returns it", async () => {
    const row = { id: "tl1", userId: "u1", name: "Haves", rules: null };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const values = { userId: "u1", name: "Haves", rules: null };
    const result = await repo.create(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["tradeLists"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("tradeListsRepo.update", () => {
  it("updates a trade list by id and userId", async () => {
    const row = { id: "tl1", name: "Renamed" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const updates = { name: "Renamed" };
    const result = await repo.update("tl1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["tradeLists"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "tl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.update("nonexistent", "u1", { name: "X" });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteByIdForUser
// ---------------------------------------------------------------------------

describe("tradeListsRepo.deleteByIdForUser", () => {
  it("deletes a trade list by id and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.deleteByIdForUser("tl1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["tradeLists"] },
      { method: "where", args: ["id", "=", "tl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.deleteByIdForUser("nonexistent", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});

// ---------------------------------------------------------------------------
// itemsWithDetails
// ---------------------------------------------------------------------------

describe("tradeListsRepo.itemsWithDetails", () => {
  it("builds the correct multi-table join query", async () => {
    const data = [
      {
        id: "tli1",
        tradeListId: "tl1",
        copyId: "cp1",
        printingId: "p1",
        collectionId: "col1",
        imageUrl: "https://example.com/img.jpg",
        setId: "set1",
        collectorNumber: "001",
        rarity: "common",
        finish: "nonfoil",
        cardName: "Fire Dragon",
        cardType: "creature",
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.itemsWithDetails("tl1", "u1");

    expect(result).toEqual(data);
    expect(calls[0]).toEqual({ method: "selectFrom", args: ["tradeListItems as tli"] });
    expect(calls[1]).toEqual({
      method: "innerJoin",
      args: ["copies as cp", "cp.id", "tli.copyId"],
    });
    expect(calls[2]).toEqual({
      method: "innerJoin",
      args: ["printings as p", "p.id", "cp.printingId"],
    });
    expect(calls[3]).toEqual({
      method: "innerJoin",
      args: ["cards as card", "card.id", "p.cardId"],
    });
    // leftJoin with callback
    expect(calls[4].method).toBe("leftJoin");
    expect(calls[4].args[0]).toBe("printingImages as pi");
    // select
    expect(calls[5].method).toBe("select");
    // where tradeListId
    expect(calls[6]).toEqual({
      method: "where",
      args: ["tli.tradeListId", "=", "tl1"],
    });
    // where userId (defense-in-depth)
    expect(calls[7]).toEqual({
      method: "where",
      args: ["tli.userId", "=", "u1"],
    });
    // orderBy
    expect(calls[8]).toEqual({ method: "orderBy", args: ["card.name"] });
    expect(calls[9]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array when trade list has no items", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.itemsWithDetails("empty-tl", "u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------

describe("tradeListsRepo.createItem", () => {
  it("inserts a new trade list item and returns it", async () => {
    const row = { id: "tli1", tradeListId: "tl1", userId: "u1", copyId: "cp1" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const values = { tradeListId: "tl1", userId: "u1", copyId: "cp1" };
    const result = await repo.createItem(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["tradeListItems"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

describe("tradeListsRepo.deleteItem", () => {
  it("deletes a trade list item by itemId, tradeListId, and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.deleteItem("tli1", "tl1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["tradeListItems"] },
      { method: "where", args: ["id", "=", "tli1"] },
      { method: "where", args: ["tradeListId", "=", "tl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when item not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = tradeListsRepo(db as any);

    const result = await repo.deleteItem("nonexistent", "tl1", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});
