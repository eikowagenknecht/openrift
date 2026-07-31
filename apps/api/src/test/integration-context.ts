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

export type { Io } from "../io.js";
export type { Services } from "../deps.js";

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
  appBaseUrl: "http://localhost:5173",
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

export { adminReq, req } from "./integration-helper.js";

/**
 * Seed a unique throwaway user owned by the calling test file.
 *
 * Integration test files share one database, so fixed user IDs create hidden
 * cross-file coupling: a plain insert collides with a pre-seeded row, and a
 * teardown `DELETE FROM users` breaks any later file that still needs the
 * row. A random UUID per file removes the coupling entirely — the file can
 * insert without `onConflict` and delete its user freely in `afterAll`.
 *
 * Pass `id` when the value must exist at module scope (e.g. for
 * `createTestContext`) — generate it there with `crypto.randomUUID()`.
 * @returns The inserted user's `id` and `email`.
 */
export async function seedTestUser(
  db: Db,
  opts?: { id?: string; isAdmin?: boolean; emailVerified?: boolean },
): Promise<{ id: string; email: string }> {
  const id = opts?.id ?? crypto.randomUUID();
  const email = `test-${id}@test.com`;
  await db
    .insertInto("users")
    .values({
      id,
      email,
      name: "Test User",
      emailVerified: opts?.emailVerified ?? true,
      image: null,
    })
    .execute();
  if (opts?.isAdmin) {
    await db.insertInto("admins").values({ userId: id }).execute();
  }
  return { id, email };
}

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

/**
 * Refresh `mv_printings_canonical_rank` (migration 215). Test files that insert
 * their own printings must call this before asserting on `printings_ordered`
 * order — an unranked printing coalesces to the sentinel and sorts last.
 * @returns A promise that resolves when the refresh completes.
 */
export async function refreshCanonicalRank(db: Db): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_printings_canonical_rank`.execute(db);
}

/**
 * Mirror `cards.type` into the `card_card_types` junction (ADR-037) for any
 * card missing junction rows. Test files that insert cards directly (instead
 * of going through the repos, which write both) must call this before anything
 * refreshes the MV — a card with an empty type set violates the catalog
 * response contract, and because the parallel files share one database, one
 * file's bare insert can 500 another file's catalog test.
 * @returns A promise that resolves when the backfill completes.
 */
export async function syncCardCardTypes(db: Db): Promise<void> {
  await sql`
    INSERT INTO card_card_types (card_id, type_slug, position)
    SELECT id, type, 0 FROM cards
    ON CONFLICT (card_id, type_slug) DO NOTHING
  `.execute(db);
}
