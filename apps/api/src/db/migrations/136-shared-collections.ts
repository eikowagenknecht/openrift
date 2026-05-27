import type { Kysely } from "kysely";
import { sql } from "kysely";

// Shared collections: a `collections` row can now be owned by a friend group
// instead of a single user. Cards are pooled (no per-contributor tracking);
// add/remove is free-for-all among members; rename/delete is owner-or-admin.
//
// Schema change is minimal because shared collections reuse the entire
// `collections` + `copies` + `collection_events` stack. We only flip
// `user_id` to nullable and add `group_id` with a check that exactly one
// of them is set. `copies.user_id` and `collection_events.user_id` keep
// pointing at the acting user — that's audit info we want to preserve
// even though the pooled UX doesn't surface it.
//
// Group cascade: deleting a friend group cascades into its collections.
// The pre-existing `prevent_nonempty_collection_delete` trigger still
// fires, so a group with non-empty shared collections can't be deleted
// without emptying them first. The group-delete UI surfaces this.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("collections")
    .alterColumn("user_id", (col) => col.dropNotNull())
    .execute();

  await db.schema.alterTable("collections").addColumn("group_id", "uuid").execute();

  await db.schema
    .alterTable("collections")
    .addForeignKeyConstraint("collections_group_id_fkey", ["group_id"], "friend_groups", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("collections")
    .addCheckConstraint(
      "chk_collections_ownership",
      sql`(user_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1`,
    )
    .execute();

  // Shared collections never act as an inbox — inbox is a personal concept
  // (where freshly-added cards land). The existing uq_collections_user_inbox
  // partial index already gives "one inbox per user"; this guard prevents
  // accidentally flipping a shared collection into inbox state.
  await db.schema
    .alterTable("collections")
    .addCheckConstraint("chk_collections_no_group_inbox", sql`group_id IS NULL OR is_inbox = false`)
    .execute();

  await db.schema
    .createIndex("idx_collections_group")
    .on("collections")
    .column("group_id")
    .execute();

  // ── Relax composite FKs that paired (collection_id, user_id) ────────────
  //
  // The composite FKs on copies and collection_events were a per-user
  // isolation guard: "copies in a collection must belong to the same user".
  // For shared collections, the collection has user_id=NULL while copies
  // and events carry the *actor's* user_id, so the pairing constraint
  // would block every shared-collection write. Replace with simple FKs on
  // the entity id alone, keeping the same ON DELETE behaviour. The original
  // per-user invariant is now enforced at the route layer via
  // canAccess/filterWritableByViewer.
  await sql`ALTER TABLE copies DROP CONSTRAINT fk_copies_collection_user`.execute(db);
  await sql`
    ALTER TABLE copies
      ADD CONSTRAINT fk_copies_collection
      FOREIGN KEY (collection_id) REFERENCES collections(id)
      ON DELETE CASCADE
  `.execute(db);

  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_from_collection_user`.execute(
    db,
  );
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_from_collection
      FOREIGN KEY (from_collection_id) REFERENCES collections(id)
      ON DELETE SET NULL
  `.execute(db);

  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_to_collection_user`.execute(
    db,
  );
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_to_collection
      FOREIGN KEY (to_collection_id) REFERENCES collections(id)
      ON DELETE SET NULL
  `.execute(db);

  // collection_events.copy_id paired with user_id had the same problem:
  // when a group member disposes a copy they didn't add, event.user_id
  // (the disposer) doesn't match copy.user_id (the contributor).
  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_copy_user`.execute(
    db,
  );
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_copy
      FOREIGN KEY (copy_id) REFERENCES copies(id)
      ON DELETE SET NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore composite FKs first (mirror order: drop simple, add composite).
  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_copy`.execute(db);
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_copy_user
      FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
      ON DELETE SET NULL (copy_id)
  `.execute(db);

  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_to_collection`.execute(
    db,
  );
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_to_collection_user
      FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (to_collection_id)
  `.execute(db);

  await sql`ALTER TABLE collection_events DROP CONSTRAINT fk_collection_events_from_collection`.execute(
    db,
  );
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_from_collection_user
      FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (from_collection_id)
  `.execute(db);

  await sql`ALTER TABLE copies DROP CONSTRAINT fk_copies_collection`.execute(db);
  await sql`
    ALTER TABLE copies
      ADD CONSTRAINT fk_copies_collection_user
      FOREIGN KEY (collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE CASCADE
  `.execute(db);

  await db.schema.dropIndex("idx_collections_group").execute();

  await db.schema
    .alterTable("collections")
    .dropConstraint("chk_collections_no_group_inbox")
    .execute();

  await db.schema.alterTable("collections").dropConstraint("chk_collections_ownership").execute();

  await db.schema.alterTable("collections").dropConstraint("collections_group_id_fkey").execute();

  await db.schema.alterTable("collections").dropColumn("group_id").execute();

  // NB: re-applying NOT NULL would fail if any shared collections exist.
  // Down is best-effort; expect manual cleanup before a real rollback.
  await db.schema
    .alterTable("collections")
    .alterColumn("user_id", (col) => col.setNotNull())
    .execute();
}
