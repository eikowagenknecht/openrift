import { describe, expect, it } from "bun:test";

import { featureFlagsRepo } from "./feature-flags.js";

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

  for (const method of ["selectAll", "select", "where", "orderBy", "values", "set"]) {
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
// listKeyEnabled
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.listKeyEnabled", () => {
  it("selects key and enabled from featureFlags", async () => {
    const data = [
      { key: "dark-mode", enabled: true },
      { key: "deck-builder", enabled: false },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.listKeyEnabled();

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["featureFlags"] },
      { method: "select", args: [["key", "enabled"]] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when no flags exist", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.listKeyEnabled();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listAll
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.listAll", () => {
  it("selects all columns from featureFlags ordered by key", async () => {
    const data = [
      {
        key: "a-flag",
        enabled: true,
        description: "desc",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        key: "b-flag",
        enabled: false,
        description: null,
        createdAt: "2026-01-02",
        updatedAt: "2026-01-02",
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.listAll();

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["featureFlags"] },
      { method: "selectAll", args: [] },
      { method: "orderBy", args: ["key"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when no flags exist", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.listAll();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getByKey
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.getByKey", () => {
  it("returns the flag row when it exists", async () => {
    const data = [{ key: "dark-mode" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.getByKey("dark-mode");

    expect(result).toEqual({ key: "dark-mode" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["featureFlags"] },
      { method: "select", args: ["key"] },
      { method: "where", args: ["key", "=", "dark-mode"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when flag does not exist", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.getByKey("nonexistent");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.create", () => {
  it("inserts a new flag with provided values", async () => {
    const insertResult = [{ insertId: undefined, numInsertedOrUpdatedRows: 1n }];
    const { db, calls } = createMockDb(insertResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const values = { key: "new-flag", enabled: true, description: "A new flag" };
    const result = await repo.create(values);

    expect(result).toEqual(insertResult);
    expect(calls).toEqual([
      { method: "insertInto", args: ["featureFlags"] },
      { method: "values", args: [values] },
      { method: "execute", args: [] },
    ]);
  });

  it("inserts a flag with null description", async () => {
    const insertResult = [{ insertId: undefined, numInsertedOrUpdatedRows: 1n }];
    const { db } = createMockDb(insertResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const values = { key: "null-desc-flag", enabled: false, description: null };
    const result = await repo.create(values);

    expect(result).toEqual(insertResult);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.update", () => {
  it("updates a flag by key with the given updates", async () => {
    const updateResult = [{ numUpdatedRows: 1n }];
    const { db, calls } = createMockDb(updateResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const updates = { enabled: true, description: "Updated desc" };
    const result = await repo.update("my-flag", updates);

    expect(result).toEqual(updateResult);
    expect(calls).toEqual([
      { method: "updateTable", args: ["featureFlags"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["key", "=", "my-flag"] },
      { method: "execute", args: [] },
    ]);
  });

  it("updates only enabled field", async () => {
    const updateResult = [{ numUpdatedRows: 1n }];
    const { db, calls } = createMockDb(updateResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const updates = { enabled: false };
    await repo.update("some-flag", updates);

    expect(calls[1]).toEqual({ method: "set", args: [{ enabled: false }] });
    expect(calls[2]).toEqual({ method: "where", args: ["key", "=", "some-flag"] });
  });
});

// ---------------------------------------------------------------------------
// deleteByKey
// ---------------------------------------------------------------------------

describe("featureFlagsRepo.deleteByKey", () => {
  it("deletes a flag by key and returns the result", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.deleteByKey("old-flag");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["featureFlags"] },
      { method: "where", args: ["key", "=", "old-flag"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when flag does not exist", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = featureFlagsRepo(db as any);

    const result = await repo.deleteByKey("nonexistent");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});
