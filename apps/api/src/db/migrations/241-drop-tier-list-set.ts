import type { Kysely } from "kysely";

/**
 * Drops `tier_lists.set_id`, the set a list was scoped to at creation.
 *
 * It was only ever a hint: it pre-filtered the builder's card pool on the first
 * visit and labelled the share page, but never constrained what could be ranked.
 * The pool is a full card browser with the whole filter bar, so a set is one
 * filter among many — a creator picks it there, per session, instead of binding
 * it to the list forever at creation time (it could not even be changed
 * afterwards).
 *
 * Added by migration 237 and never read for anything load-bearing, so nothing
 * has to be migrated out of it first.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // The foreign key goes with the column in PostgreSQL, so there is no separate
  // constraint drop to do here.
  await db.schema.alterTable("tier_lists").dropColumn("set_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tier_lists").addColumn("set_id", "uuid").execute();
  await db.schema
    .alterTable("tier_lists")
    .addForeignKeyConstraint("tier_lists_set_id_fkey", ["set_id"], "sets", ["id"])
    .onDelete("set null")
    .execute();
}
