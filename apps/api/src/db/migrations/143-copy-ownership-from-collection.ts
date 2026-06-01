import type { Kysely } from "kysely";
import { sql } from "kysely";

// Derive copy ownership from the collection instead of stamping it on each
// copy. A `copies` row no longer carries `user_id`: who "owns" a copy is now
// fully determined by its collection (personal collections set user_id, group
// collections set group_id). When a card lands in a group collection the
// contributor gives up ownership — the copy belongs to the group. Visibility
// and write access are already collection-based (getAccessForUser /
// filterWritableByViewer), so this drop only removes a redundant column that
// had drifted out of sync for group collections (it kept pointing at the
// contributor, which is why other members couldn't see pooled cards).
//
// Audit trail is unaffected: `collection_events.user_id` records the *actor*
// of each add/move/remove and is a separate column we keep.
//
// Deck-building availability becomes a per-viewer preference. The old single
// boolean on `collections` only worked because a personal collection has
// exactly one viewer (the owner). Group collections have many, each with their
// own opinion, so availability moves to `collection_deckbuilding_prefs`
// keyed by (user_id, collection_id). A row is an explicit override; absence
// falls back to a type default of "available if it's my own collection"
// (group_id IS NULL) — see COALESCE(pref.available, c.group_id IS NULL) in the
// repositories. So personal collections stay deckbuilding-available by default
// (matching today) and group collections are opt-in per member.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Per-viewer deck-building preferences ────────────────────────────────
  await db.schema
    .createTable("collection_deckbuilding_prefs")
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("collection_id", "uuid", (col) => col.notNull())
    .addColumn("available", "boolean", (col) => col.notNull())
    .addPrimaryKeyConstraint("collection_deckbuilding_prefs_pkey", ["user_id", "collection_id"])
    .execute();

  await db.schema
    .alterTable("collection_deckbuilding_prefs")
    .addForeignKeyConstraint("fk_collection_deckbuilding_prefs_user", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("collection_deckbuilding_prefs")
    .addForeignKeyConstraint(
      "fk_collection_deckbuilding_prefs_collection",
      ["collection_id"],
      "collections",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_collection_deckbuilding_prefs_collection")
    .on("collection_deckbuilding_prefs")
    .column("collection_id")
    .execute();

  // Preserve existing intent: personal collections explicitly turned OFF today
  // become explicit `available=false` overrides. Personal collections that are
  // ON (the default) need no row. Group collections' old column value is
  // discarded — pooled deck-building is now opt-in per member (default off).
  await sql`
    insert into collection_deckbuilding_prefs (user_id, collection_id, available)
    select user_id, id, false
    from collections
    where group_id is null
      and user_id is not null
      and available_for_deckbuilding = false
  `.execute(db);

  await db.schema.alterTable("collections").dropColumn("available_for_deckbuilding").execute();

  // ── Drop copies.user_id and everything that depended on it ──────────────
  //
  // list_entries paired (copy_id, user_id) → copies(id, user_id) so a trade
  // list could only reference your own copies. Under collection-derived
  // ownership that guard moves to the route layer (existsForViewer /
  // filterAccessibleByViewer), so relax it to a plain FK on copy_id.
  await sql`ALTER TABLE list_entries DROP CONSTRAINT fk_list_entries_copy_user`.execute(db);
  await sql`
    ALTER TABLE list_entries
      ADD CONSTRAINT fk_list_entries_copy
      FOREIGN KEY (copy_id) REFERENCES copies(id)
      ON DELETE CASCADE
  `.execute(db);

  // The UNIQUE(id, user_id) only existed to be a composite-FK target; nothing
  // needs it once list_entries uses the simple FK above.
  await sql`ALTER TABLE copies DROP CONSTRAINT uq_copies_id_user`.execute(db);

  // Owned-count-by-printing used (user_id, printing_id). Replace with a
  // printing-only index for the deck-building aggregation joins.
  await db.schema.dropIndex("idx_copies_user_printing").execute();
  await db.schema.createIndex("idx_copies_printing").on("copies").column("printing_id").execute();

  await sql`ALTER TABLE copies DROP CONSTRAINT copies_user_id_fkey`.execute(db);
  await db.schema.alterTable("copies").dropColumn("user_id").execute();
}

// Down is best-effort (mirrors migration 136). On a populated database the
// contributor identity is gone, so copies in group collections cannot be
// re-attributed and the NOT NULL restore below would fail — manual cleanup is
// expected before a real rollback. On the empty database used by the
// migration round-trip test the tables have no rows, so this restores cleanly.
export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Restore copies.user_id ──────────────────────────────────────────────
  await db.schema.alterTable("copies").addColumn("user_id", "text").execute();
  // Best-effort backfill from the personal collection owner; group copies stay
  // NULL (unrecoverable).
  await sql`
    update copies
    set user_id = c.user_id
    from collections c
    where c.id = copies.collection_id
      and c.user_id is not null
  `.execute(db);
  await db.schema
    .alterTable("copies")
    .alterColumn("user_id", (col) => col.setNotNull())
    .execute();

  await sql`
    ALTER TABLE copies
      ADD CONSTRAINT copies_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE
  `.execute(db);

  await sql`ALTER TABLE copies ADD CONSTRAINT uq_copies_id_user UNIQUE (id, user_id)`.execute(db);

  await db.schema.dropIndex("idx_copies_printing").execute();
  await db.schema
    .createIndex("idx_copies_user_printing")
    .on("copies")
    .columns(["user_id", "printing_id"])
    .execute();

  await sql`ALTER TABLE list_entries DROP CONSTRAINT fk_list_entries_copy`.execute(db);
  await sql`
    ALTER TABLE list_entries
      ADD CONSTRAINT fk_list_entries_copy_user
      FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
      ON DELETE CASCADE
  `.execute(db);

  // ── Restore collections.available_for_deckbuilding ──────────────────────
  await db.schema
    .alterTable("collections")
    .addColumn("available_for_deckbuilding", "boolean", (col) => col.notNull().defaultTo(true))
    .execute();

  await db.schema.dropTable("collection_deckbuilding_prefs").execute();
}
