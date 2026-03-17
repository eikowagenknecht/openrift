import { describe, expect, it } from "bun:test";

import { sourcesRepo } from "./sources.js";

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

describe("sourcesRepo.listForUser", () => {
  it("selects all sources for a user ordered by name", async () => {
    const data = [
      { id: "s1", userId: "u1", name: "Alpha", description: null },
      { id: "s2", userId: "u1", name: "Beta", description: "desc" },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["sources"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when user has no sources", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("sourcesRepo.getByIdForUser", () => {
  it("returns the source when it exists", async () => {
    const data = [{ id: "s1", userId: "u1", name: "Alpha" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.getByIdForUser("s1", "u1");

    expect(result).toEqual({ id: "s1", userId: "u1", name: "Alpha" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["sources"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "s1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("sourcesRepo.create", () => {
  it("inserts a new source and returns it", async () => {
    const row = { id: "s1", userId: "u1", name: "New Source", description: null };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const values = { userId: "u1", name: "New Source", description: null };
    const result = await repo.create(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["sources"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });

  it("inserts a source with a description", async () => {
    const row = { id: "s2", userId: "u1", name: "Shop", description: "Local card shop" };
    const { db } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.create({
      userId: "u1",
      name: "Shop",
      description: "Local card shop",
    });

    expect(result).toEqual(row);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("sourcesRepo.update", () => {
  it("updates a source by id and userId", async () => {
    const row = { id: "s1", userId: "u1", name: "Updated" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const updates = { name: "Updated" };
    const result = await repo.update("s1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["sources"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "s1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when source not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.update("nonexistent", "u1", { name: "X" });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteByIdForUser
// ---------------------------------------------------------------------------

describe("sourcesRepo.deleteByIdForUser", () => {
  it("deletes a source by id and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.deleteByIdForUser("s1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["sources"] },
      { method: "where", args: ["id", "=", "s1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = sourcesRepo(db as any);

    const result = await repo.deleteByIdForUser("nonexistent", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});
