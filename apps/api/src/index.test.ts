import { describe, expect, it, beforeEach } from "vitest";

import { createApp } from "./app.js";

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

const mockState = {
  tables: {} as Record<string, unknown[]>,
  tableErrors: {} as Record<string, boolean>,
  sqlFails: false,
};

function createMockDb() {
  return {
    selectNoFrom: () => {
      const chain: Record<string, unknown> = {
        as: () => chain,
        execute: () => {
          if (mockState.sqlFails) {
            throw new Error("connection refused");
          }
          return [{ one: 1 }];
        },
      };
      return chain;
    },
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
  };
}

const mockAuth = {
  handler: () => new Response("ok"),
  api: { getSession: () => null },
  $Infer: { Session: { user: null, session: null } },
};

const mockConfig = {
  port: 3000,
  databaseUrl: "postgres://mock",
  corsOrigin: undefined,
  auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
};

// oxlint-disable -- test mocks don't match full types
const app = createApp({
  db: createMockDb() as any,
  auth: mockAuth as any,
  config: mockConfig as any,
});
// oxlint-enable

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
