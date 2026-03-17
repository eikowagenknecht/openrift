import { describe, expect, it } from "bun:test";

import { collectionsRepo } from "./collections.js";

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
  };

  return { db, calls };
}

// ---------------------------------------------------------------------------
// listForUser
// ---------------------------------------------------------------------------

describe("collectionsRepo.listForUser", () => {
  it("selects all collections ordered by inbox first, then sort order and name", async () => {
    const data = [
      { id: "c1", name: "Inbox", isInbox: true, sortOrder: 0 },
      { id: "c2", name: "Binder", isInbox: false, sortOrder: 1 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["collections"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["isInbox", "desc"] },
      { method: "orderBy", args: ["sortOrder"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when user has no collections", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("collectionsRepo.getByIdForUser", () => {
  it("returns the collection when it exists", async () => {
    const data = [{ id: "c1", userId: "u1", name: "Inbox" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.getByIdForUser("c1", "u1");

    expect(result).toEqual({ id: "c1", userId: "u1", name: "Inbox" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["collections"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "c1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("collectionsRepo.create", () => {
  it("inserts a new collection and returns it", async () => {
    const row = {
      id: "c1",
      userId: "u1",
      name: "New Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
    };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const values = {
      userId: "u1",
      name: "New Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
    };
    const result = await repo.create(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["collections"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("collectionsRepo.update", () => {
  it("updates a collection by id and userId", async () => {
    const row = { id: "c1", userId: "u1", name: "Renamed" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const updates = { name: "Renamed" };
    const result = await repo.update("c1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["collections"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "c1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when collection not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.update("nonexistent", "u1", { name: "X" });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getIdAndName
// ---------------------------------------------------------------------------

describe("collectionsRepo.getIdAndName", () => {
  it("returns id and name when found", async () => {
    const data = [{ id: "c1", name: "Inbox" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.getIdAndName("c1", "u1");

    expect(result).toEqual({ id: "c1", name: "Inbox" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["collections"] },
      { method: "select", args: [["id", "name"]] },
      { method: "where", args: ["id", "=", "c1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.getIdAndName("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("collectionsRepo.exists", () => {
  it("returns the id when collection exists", async () => {
    const data = [{ id: "c1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.exists("c1", "u1");

    expect(result).toEqual({ id: "c1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["collections"] },
      { method: "select", args: ["id"] },
      { method: "where", args: ["id", "=", "c1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = collectionsRepo(db as any);

    const result = await repo.exists("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});
