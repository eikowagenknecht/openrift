/**
 * Assumes the shared integration DB has already been created by run-integration.ts.
 */

import { createLogger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { createApp } from "../app.js";
import { createDb } from "../db/connect.js";
import type { Database } from "../db/tables.js";
import type { Services } from "../deps.js";
import type { Io } from "../io.js";

export type { Io } from "../io.js";
export type { Services } from "../deps.js";

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

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  appBaseUrl: "http://localhost:5173",
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
} as any;

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

export function createDbContext(userId: string): DbContext | null {
  const db = getSharedDb();
  if (!db) {
    return null;
  }
  return { db, userId };
}

export { adminReq, req } from "./integration-helper.js";

/** Integration test files share one database; a random per-file UUID avoids
 *  insert/teardown collisions between files using a fixed id. */
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

/** Refresh again after inserting cards/card_domains, or MV-joined queries won't see them. */
export async function refreshCardAggregates(db: Db): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_card_aggregates`.execute(db);
}

/** Call before asserting `printings_ordered` order; an unranked printing sorts last. */
export async function refreshCanonicalRank(db: Db): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_printings_canonical_rank`.execute(db);
}

/** Call before refreshing the MV when inserting cards directly (bypassing the repos),
 *  or the missing junction rows can 500 another file's catalog test. */
export async function syncCardCardTypes(db: Db): Promise<void> {
  await sql`
    INSERT INTO card_card_types (card_id, type_slug, position)
    SELECT id, type, 0 FROM cards
    ON CONFLICT (card_id, type_slug) DO NOTHING
  `.execute(db);
}
