/* oxlint-disable
   promise/avoid-new
   -- need a never-resolving promise to test timeout */
import { Kysely } from "kysely";
import type { Dialect } from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../../../db/index.js";
import { healthRepo } from "./health.js";

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
    // Only the calls healthRepo makes are stubbed; the cast stands in for the
    // rest of Kysely's Dialect surface (migration locks, streaming, query ids).
    dialect: {
      createAdapter: () => ({ supportsTransactionalDdl: true, supportsReturning: true }),
      createDriver: () => mockDriver,
      createIntrospector: () => ({}),
      createQueryCompiler: () => ({
        compileQuery: (node: any) => ({
          sql: "",
          parameters: [],
          query: node,
        }),
      }),
    } as unknown as Dialect,
  });
}

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
    const mockDb = {
      executeQuery: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(1);
    expect(status).toBe("db_unreachable");
  });

  it("returns 'ok' when DB is connected, migrated, and has data", async () => {
    const mockDb = createHealthMockDb([
      { rows: [{ "?column?": 1 }] },
      { rows: [{ exists: true }] },
      { rows: [{ id: "set-1" }] },
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
    let callIndex = 0;
    const mockDriver = {
      init: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      acquireConnection: () =>
        Promise.resolve({
          executeQuery: () => {
            callIndex++;
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
        createIntrospector: () => ({}),
        createQueryCompiler: () => ({
          compileQuery: (node: any) => ({
            sql: "",
            parameters: [],
            query: node,
          }),
        }),
      } as unknown as Dialect,
    });

    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(1);
    expect(status).toBe("db_unreachable");
  });
});
