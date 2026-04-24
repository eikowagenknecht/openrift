/**
 * Shared integration test context.
 *
 * Each test file calls `createTestContext(userId)` once at the top level
 * to get a Hono app wired to the shared integration database with mocked
 * auth for the given user. The shared DB is created by run-integration.ts
 * and its URL is passed via INTEGRATION_DB_URL.
 */

import { createLogger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { createApp } from "../app.js";
import { createDb } from "../db/connect.js";
import type { Database } from "../db/types.js";
import type { Services } from "../deps.js";
import type { Io } from "../io.js";

export type { Io, Services };

// ---------------------------------------------------------------------------
// Shared Kysely instance — created once per process, reused across files
// ---------------------------------------------------------------------------

type Db = Kysely<Database>;

let sharedDb: Db | null = null;

function getSharedDb() {
  if (sharedDb) {
    return sharedDb;
  }
  const url = process.env.INTEGRATION_DB_URL;
  if (!url) {
    return null;
  }
  ({ db: sharedDb } = createDb(url));
  return sharedDb;
}

// ---------------------------------------------------------------------------
// Mock config — identical across all integration tests
// ---------------------------------------------------------------------------

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
} as any;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TestContext {
  app: ReturnType<typeof createApp>;
  db: Db;
  userId: string;
}

export function createTestContext(
  userId: string,
  emailOrOptions?: string | { email?: string; services?: Partial<Services>; io?: Io },
): TestContext | null {
  const db = getSharedDb();
  if (!db) {
    return null;
  }

  const opts = typeof emailOrOptions === "string" ? { email: emailOrOptions } : emailOrOptions;
  const resolvedEmail = opts?.email ?? `user-${userId.slice(14, 18)}@test.com`;

  const mockAuth = {
    handler: () => new Response("ok"),
    api: {
      // oxlint-disable-next-line require-await -- must return a Promise to match better-auth's API shape
      getSession: async () => ({
        user: { id: userId, email: resolvedEmail, name: "Test User" },
        session: { id: `sess-${userId.slice(14, 18)}` },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  } as any;

  const app = createApp({
    db,
    auth: mockAuth,
    config: mockConfig,
    log: createLogger("test", "silent"),
    services: opts?.services,
    io: opts?.io,
  });
  return { app, db, userId };
}

export function createUnauthenticatedTestContext(): TestContext | null {
  const db = getSharedDb();
  if (!db) {
    return null;
  }

  const mockAuth = {
    handler: () => new Response("ok"),
    // oxlint-disable-next-line require-await -- must return a Promise to match better-auth's API shape
    api: { getSession: async () => null },
    $Infer: { Session: { user: null, session: null } },
  } as any;

  const app = createApp({
    db,
    auth: mockAuth,
    config: mockConfig,
    log: createLogger("test", "silent"),
  });
  return { app, db, userId: "" };
}

export interface DbContext {
  db: Db;
  userId: string;
}

/** Lightweight context for repo-level integration tests (no app/auth).
 * @returns A `DbContext` with the shared DB, or `null` if `INTEGRATION_DB_URL` is not set.
 */
export function createDbContext(userId: string): DbContext | null {
  const db = getSharedDb();
  if (!db) {
    return null;
  }
  return { db, userId };
}

export { req } from "./integration-helper.js";

/**
 * Refresh `mv_card_aggregates`. The integration harness refreshes it once at
 * startup, but test files that insert their own cards + card_domains need to
 * refresh again so INNER JOINs on the MV (e.g. in unified-mappings queries)
 * see the new rows.
 * @returns A promise that resolves when the refresh completes.
 */
export async function refreshCardAggregates(db: Db): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_card_aggregates`.execute(db);
}
