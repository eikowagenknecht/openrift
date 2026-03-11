import { mock, describe, expect, it, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Shared mutable state for mocks
// ---------------------------------------------------------------------------

const mockState = {
  tables: {} as Record<string, unknown[]>,
  tableErrors: {} as Record<string, boolean>,
  sqlFails: false,
};

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports by bun:test
// ---------------------------------------------------------------------------

mock.module("./config.js", () => ({
  config: {
    port: 3000,
    databaseUrl: "postgres://mock",
    corsOrigin: undefined,
    auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
    smtp: { configured: false },
    cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
  },
}));

mock.module("kysely", () => {
  const makeSql = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    const obj: Record<string, unknown> = {
      as: () => obj,
      execute: () => {
        if (mockState.sqlFails) {
          throw new Error("connection refused");
        }
      },
    };
    return obj;
  };
  return {
    sql: makeSql,
    // oxlint-disable-next-line typescript/no-extraneous-class -- mock placeholder for Kysely class
    Kysely: class {},
  };
});

mock.module("./db.js", () => ({
  db: {
    selectFrom: (table: string) => {
      const chain: Record<string, unknown> = {
        selectAll: () => chain,
        select: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => {
          if (mockState.tableErrors[table]) {
            throw new Error(`relation "${table}" does not exist`);
          }
          return mockState.tables[table] ?? [];
        },
      };
      return chain;
    },
  },
  dialect: {},
}));

mock.module("./auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: { getSession: () => null },
    $Infer: { Session: { user: null, session: null } },
  },
}));

// oxlint-disable-next-line import/first -- mock.module must come before imports
import { app } from "./app";

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  beforeEach(() => {
    mockState.tables = {};
    mockState.tableErrors = {};
    mockState.sqlFails = false;
  });

  it('returns { status: "ok" } when db is healthy and has data', async () => {
    mockState.tables.sets = [{ id: "OGS" }];

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it('returns 503 { status: "db_unreachable" } when sql ping fails', async () => {
    mockState.sqlFails = true;

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_unreachable");
  });

  it('returns 503 { status: "db_not_migrated" } when sets table does not exist', async () => {
    mockState.tableErrors.sets = true;

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_not_migrated");
  });

  it('returns 503 { status: "db_empty" } when sets table is empty', async () => {
    mockState.tables.sets = [];

    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("db_empty");
  });
});
