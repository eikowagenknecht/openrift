import { describe, expect, it } from "bun:test";

import { wishListsRepo } from "./wish-lists.js";

// DEBUG: Log what wishListsRepo actually is to diagnose CI-only failure
console.log("[DEBUG] wishListsRepo type:", typeof wishListsRepo);
if (typeof wishListsRepo === "function") {
  const fakeDb = { selectFrom: () => ({}) };
  const result = wishListsRepo(fakeDb as never);
  console.log("[DEBUG] wishListsRepo(db) type:", typeof result);
  console.log("[DEBUG] wishListsRepo(db) keys:", Object.keys(result));
}

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

describe("wishListsRepo.listForUser", () => {
  it("selects all wish lists for a user ordered by name", async () => {
    const data = [
      { id: "wl1", name: "Alpha Wishes" },
      { id: "wl2", name: "Beta Wishes" },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["wishLists"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when user has no wish lists", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("wishListsRepo.getByIdForUser", () => {
  it("returns the wish list when it exists", async () => {
    const data = [{ id: "wl1", userId: "u1", name: "My Wishes" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.getByIdForUser("wl1", "u1");

    expect(result).toEqual({ id: "wl1", userId: "u1", name: "My Wishes" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["wishLists"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("wishListsRepo.exists", () => {
  it("returns the id when wish list exists", async () => {
    const data = [{ id: "wl1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.exists("wl1", "u1");

    expect(result).toEqual({ id: "wl1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["wishLists"] },
      { method: "select", args: ["id"] },
      { method: "where", args: ["id", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.exists("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("wishListsRepo.create", () => {
  it("inserts a new wish list and returns it", async () => {
    const row = { id: "wl1", userId: "u1", name: "New List", rules: null };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const values = { userId: "u1", name: "New List", rules: null };
    const result = await repo.create(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["wishLists"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("wishListsRepo.update", () => {
  it("updates a wish list by id and userId", async () => {
    const row = { id: "wl1", name: "Renamed" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const updates = { name: "Renamed" };
    const result = await repo.update("wl1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["wishLists"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.update("nonexistent", "u1", { name: "X" });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteByIdForUser
// ---------------------------------------------------------------------------

describe("wishListsRepo.deleteByIdForUser", () => {
  it("deletes a wish list by id and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.deleteByIdForUser("wl1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["wishLists"] },
      { method: "where", args: ["id", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.deleteByIdForUser("nonexistent", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

describe("wishListsRepo.items", () => {
  it("selects all items for a wish list scoped to user", async () => {
    const data = [
      { id: "wli1", wishListId: "wl1", cardId: "card1", printingId: null, quantityDesired: 2 },
      { id: "wli2", wishListId: "wl1", cardId: null, printingId: "p1", quantityDesired: 1 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.items("wl1", "u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["wishListItems"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["wishListId", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when wish list has no items", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.items("empty-wl", "u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------

describe("wishListsRepo.createItem", () => {
  it("inserts a new wish list item and returns it", async () => {
    const row = {
      id: "wli1",
      wishListId: "wl1",
      userId: "u1",
      cardId: "card1",
      printingId: null,
      quantityDesired: 3,
    };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const values = {
      wishListId: "wl1",
      userId: "u1",
      cardId: "card1",
      printingId: null,
      quantityDesired: 3,
    };
    const result = await repo.createItem(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["wishListItems"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

describe("wishListsRepo.updateItem", () => {
  it("updates a wish list item by itemId, wishListId, and userId", async () => {
    const row = { id: "wli1", quantityDesired: 5 };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const updates = { quantityDesired: 5 };
    const result = await repo.updateItem("wli1", "wl1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["wishListItems"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "wli1"] },
      { method: "where", args: ["wishListId", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when item not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.updateItem("nonexistent", "wl1", "u1", { quantityDesired: 1 });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

describe("wishListsRepo.deleteItem", () => {
  it("deletes a wish list item by itemId, wishListId, and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.deleteItem("wli1", "wl1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["wishListItems"] },
      { method: "where", args: ["id", "=", "wli1"] },
      { method: "where", args: ["wishListId", "=", "wl1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when item not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = wishListsRepo(db as any);

    const result = await repo.deleteItem("nonexistent", "wl1", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});
