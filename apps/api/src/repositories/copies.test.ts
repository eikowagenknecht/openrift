import { describe, expect, it, vi } from "bun:test";

import { copiesRepo } from "./copies.js";

// DEBUG: Log what copiesRepo actually is to diagnose CI-only failure
console.log("[DEBUG] copiesRepo type:", typeof copiesRepo);
console.log("[DEBUG] copiesRepo:", copiesRepo);
if (typeof copiesRepo === "function") {
  const fakeDb = { selectFrom: () => ({}) };
  const result = copiesRepo(fakeDb as never);
  console.log("[DEBUG] copiesRepo(db) type:", typeof result);
  console.log("[DEBUG] copiesRepo(db) keys:", Object.keys(result));
  console.log("[DEBUG] copiesRepo(db):", result);
}

// ---------------------------------------------------------------------------
// Mock DB — tracks calls to verify the repo builds correct queries
// ---------------------------------------------------------------------------

interface CallLog {
  method: string;
  args: unknown[];
}

/**
 * Creates a mock db that intercepts calls to selectFrom and also mocks the
 * `selectCopyWithCard` helper (which is imported by the module under test).
 * For methods that go through `selectCopyWithCard`, we mock at the module level.
 * For methods that call `db.selectFrom` directly, the mock db handles it.
 * @returns The mock db and recorded calls
 */
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
    "groupBy",
    "innerJoin",
    "leftJoin",
  ]) {
    // oxlint-disable-next-line arrow-body-style -- multi-statement mock needs block body
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

  return { db, calls, chain };
}

// ---------------------------------------------------------------------------
// Mock selectCopyWithCard and imageUrl — they're imported by copies.ts
// ---------------------------------------------------------------------------

// We need to mock the db-helpers module so that selectCopyWithCard returns our chain
vi.mock("../db-helpers.js", () => ({
  // selectCopyWithCard receives the db and returns a query builder chain.
  // We store a reference so tests can set it up before calling repo methods.
  // Call selectFrom on the mock db to record the call, then return the chain
  selectCopyWithCard: (db: Record<string, unknown>) =>
    db.selectFrom("copies as cp [via selectCopyWithCard]"),
  imageUrl: () => ({ as: (alias: string) => `imageUrl(${alias})` }),
}));

// ---------------------------------------------------------------------------
// countByPrintingForUser
// ---------------------------------------------------------------------------

describe("copiesRepo.countByPrintingForUser", () => {
  it("selects printing count grouped by printingId", async () => {
    const data = [
      { printingId: "p1", count: 3 },
      { printingId: "p2", count: 1 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.countByPrintingForUser("u1");

    expect(result).toEqual(data);
    expect(calls[0]).toEqual({ method: "selectFrom", args: ["copies"] });
    // select gets the column array with a sql tagged template
    expect(calls[1].method).toBe("select");
    expect(calls[2]).toEqual({ method: "where", args: ["userId", "=", "u1"] });
    expect(calls[3]).toEqual({ method: "groupBy", args: ["printingId"] });
    expect(calls[4]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array when user has no copies", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.countByPrintingForUser("u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listForCollection
// ---------------------------------------------------------------------------

describe("copiesRepo.listForCollection", () => {
  it("builds the correct query for listing copies in a collection", async () => {
    const data = [{ id: "cp1", printingId: "p1", collectionId: "col1", cardName: "Alpha" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.listForCollection("col1");

    expect(result).toEqual(data);
    // selectCopyWithCard is called first (mapped to selectFrom)
    expect(calls[0]).toEqual({
      method: "selectFrom",
      args: ["copies as cp [via selectCopyWithCard]"],
    });
    expect(calls[1].method).toBe("select");
    expect(calls[2]).toEqual({
      method: "where",
      args: ["cp.collectionId", "=", "col1"],
    });
    expect(calls[3]).toEqual({ method: "orderBy", args: ["c.name"] });
    expect(calls[4]).toEqual({ method: "orderBy", args: ["p.collectorNumber"] });
    expect(calls[5]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array for empty collection", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.listForCollection("empty-col");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listForUser (via selectCopyWithCard)
// ---------------------------------------------------------------------------

describe("copiesRepo.listForUser", () => {
  it("builds the correct query for listing user copies", async () => {
    const data = [{ id: "cp1", cardName: "Alpha" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls[0]).toEqual({
      method: "selectFrom",
      args: ["copies as cp [via selectCopyWithCard]"],
    });
    expect(calls[1].method).toBe("select");
    expect(calls[2]).toEqual({ method: "where", args: ["cp.userId", "=", "u1"] });
    expect(calls[3]).toEqual({ method: "orderBy", args: ["c.name"] });
    expect(calls[4]).toEqual({ method: "orderBy", args: ["p.collectorNumber"] });
    expect(calls[5]).toEqual({ method: "execute", args: [] });
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser (via selectCopyWithCard)
// ---------------------------------------------------------------------------

describe("copiesRepo.getByIdForUser", () => {
  it("returns a single copy by id and userId", async () => {
    const data = [{ id: "cp1", cardName: "Alpha" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.getByIdForUser("cp1", "u1");

    expect(result).toEqual({ id: "cp1", cardName: "Alpha" });
    expect(calls[0]).toEqual({
      method: "selectFrom",
      args: ["copies as cp [via selectCopyWithCard]"],
    });
    expect(calls[1].method).toBe("select");
    expect(calls[2]).toEqual({ method: "where", args: ["cp.id", "=", "cp1"] });
    expect(calls[3]).toEqual({ method: "where", args: ["cp.userId", "=", "u1"] });
    expect(calls[4]).toEqual({ method: "executeTakeFirst", args: [] });
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// existsForUser
// ---------------------------------------------------------------------------

describe("copiesRepo.existsForUser", () => {
  it("returns the id when copy exists for user", async () => {
    const data = [{ id: "cp1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.existsForUser("cp1", "u1");

    expect(result).toEqual({ id: "cp1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["copies"] },
      { method: "select", args: ["id"] },
      { method: "where", args: ["id", "=", "cp1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when copy not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.existsForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listByIdsForUser (via selectCopyWithCard)
// ---------------------------------------------------------------------------

describe("copiesRepo.listByIdsForUser", () => {
  it("selects multiple copies by IDs for a user", async () => {
    const data = [
      { id: "cp1", cardName: "Alpha" },
      { id: "cp2", cardName: "Beta" },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = copiesRepo(db as any);

    const result = await repo.listByIdsForUser(["cp1", "cp2"], "u1");

    expect(result).toEqual(data);
    expect(calls[2]).toEqual({
      method: "where",
      args: ["cp.id", "in", ["cp1", "cp2"]],
    });
    expect(calls[3]).toEqual({ method: "where", args: ["cp.userId", "=", "u1"] });
  });
});
