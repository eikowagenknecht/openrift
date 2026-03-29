/* oxlint-disable
   promise/avoid-new
   -- need a never-resolving promise to test timeout */
import { Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../db/index.js";
import { healthRepo } from "./health.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @returns A mock Kysely db that returns results in sequence for executeQuery. */
function createHealthMockDb(results: { rows: unknown[] }[]) {
  let callIndex = 0;
  const mockDriver = {
    init: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
    acquireConnection: () =>
      Promise.resolve({
        executeQuery: () => {
          const result = results[callIndex++];
          return Promise.resolve(result ?? { rows: [] });
        },
      }),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
  };

  return new Kysely<Database>({
    dialect: {
      createAdapter: () => ({ supportsTransactionalDdl: true, supportsReturning: true }),
      createDriver: () => mockDriver,
      createIntrospector: () => ({}) as any,
      createQueryCompiler: () => ({
        compileQuery: (node: any) => ({
          sql: "",
          parameters: [],
          query: node,
        }),
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("healthRepo", () => {
  it("returns 'db_unreachable' when DB connection throws", async () => {
    const mockDb = {
      executeQuery: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as any;
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(5000);
    expect(status).toBe("db_unreachable");
  });

  it("returns 'db_unreachable' on timeout", async () => {
    // Create a mock that hangs forever — triggers the HealthTimeoutError path
    const mockDb = {
      executeQuery: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(1);
    expect(status).toBe("db_unreachable");
  });

  it("returns 'ok' when DB is connected, migrated, and has data", async () => {
    const mockDb = createHealthMockDb([
      { rows: [{ "?column?": 1 }] }, // SELECT 1
      { rows: [{ exists: true }] }, // EXISTS check
      { rows: [{ id: "set-1" }] }, // selectFrom("sets")
    ]);
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(5000);
    expect(status).toBe("ok");
  });

  it("returns 'db_empty' when migrated but no data in sets", async () => {
    const mockDb = createHealthMockDb([
      { rows: [{ "?column?": 1 }] },
      { rows: [{ exists: true }] },
      { rows: [] },
    ]);
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(5000);
    expect(status).toBe("db_empty");
  });

  it("returns 'db_not_migrated' when sets table does not exist", async () => {
    const mockDb = createHealthMockDb([
      { rows: [{ "?column?": 1 }] },
      { rows: [{ exists: false }] },
    ]);
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(5000);
    expect(status).toBe("db_not_migrated");
  });

  it("returns 'db_unreachable' when check hangs past the timeout", async () => {
    // Create a mock that delays long enough for the timeout to fire,
    // exercising the HealthTimeoutError constructor (lines 10-11) and
    // the instanceof check (line 60-61).
    let callIndex = 0;
    const mockDriver = {
      init: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      acquireConnection: () =>
        Promise.resolve({
          executeQuery: () => {
            callIndex++;
            // First call (SELECT 1) hangs forever — triggers timeout
            return new Promise(() => {});
          },
        }),
      beginTransaction: () => Promise.resolve(),
      commitTransaction: () => Promise.resolve(),
      rollbackTransaction: () => Promise.resolve(),
      releaseConnection: () => Promise.resolve(),
    };

    const mockDb = new Kysely<Database>({
      dialect: {
        createAdapter: () => ({ supportsTransactionalDdl: true, supportsReturning: true }),
        createDriver: () => mockDriver,
        createIntrospector: () => ({}) as any,
        createQueryCompiler: () => ({
          compileQuery: (node: any) => ({
            sql: "",
            parameters: [],
            query: node,
          }),
        }),
      },
    });

    const repo = healthRepo(mockDb);
    // Very short timeout to ensure HealthTimeoutError fires
    const status = await repo.healthCheck(1);
    expect(status).toBe("db_unreachable");
  });
});
