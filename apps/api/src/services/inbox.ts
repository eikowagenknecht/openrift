import type { Database } from "@openrift/shared/db";
import type { Kysely } from "kysely";

/**
 * Ensures the user has an inbox collection. Creates one if it doesn't exist.
 * @returns The inbox collection ID
 */
export async function ensureInbox(db: Kysely<Database>, userId: string): Promise<string> {
  const existing = await db
    .selectFrom("collections")
    .select("id")
    .where("user_id", "=", userId)
    .where("is_inbox", "=", true)
    .executeTakeFirst();

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db
    .insertInto("collections")
    .values({
      id,
      user_id: userId,
      name: "Inbox",
      is_inbox: true,
      available_for_deckbuilding: true,
      sort_order: 0,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  // In case of a race, re-fetch
  const row = await db
    .selectFrom("collections")
    .select("id")
    .where("user_id", "=", userId)
    .where("is_inbox", "=", true)
    .executeTakeFirst();

  if (!row) {
    throw new Error("Inbox collection not found after insert");
  }
  return row.id;
}
