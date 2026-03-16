import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Ensures the user has an inbox collection. Creates one if it doesn't exist.
 * @returns The inbox collection ID
 */
export async function ensureInbox(db: Kysely<Database>, userId: string): Promise<string> {
  const existing = await db
    .selectFrom("collections")
    .select("id")
    .where("userId", "=", userId)
    .where("isInbox", "=", true)
    .executeTakeFirst();

  if (existing) {
    return existing.id;
  }

  await db
    .insertInto("collections")
    .values({
      userId: userId,
      name: "Inbox",
      isInbox: true,
      availableForDeckbuilding: true,
      sortOrder: 0,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  // In case of a race, re-fetch
  const row = await db
    .selectFrom("collections")
    .select("id")
    .where("userId", "=", userId)
    .where("isInbox", "=", true)
    .executeTakeFirst();

  if (!row) {
    throw new Error("Inbox collection not found after insert");
  }
  return row.id;
}
