import type { Kysely } from "kysely";
import { sql } from "kysely";

// Admin-curated archive of competitive decklists (ADR-014).
//
// The archived decks themselves are ordinary `decks` rows — same card lists,
// same legend/champion zones, same share-token permalinks — owned by one
// seeded synthetic user. Only the event metadata and the per-deck placement
// are new, and they live in these two tables rather than as nullable columns
// on `decks`, so every existing deck query stays archive-agnostic.
//
// `meta_decks.deck_id` is the primary key because a deck belongs to exactly
// one event. Both FKs cascade: deleting an event takes its satellite rows,
// deleting a deck takes its own. Neither cascade reaches the `decks` rows
// themselves, so the admin delete-event path deletes those explicitly.
//
// Unrelated to the ADR-033 tournament runner (`tournaments`). No foreign keys
// between the two, by design — the runner holds player-submitted decks whose
// publication is a consent question this archive deliberately does not touch.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── The synthetic owner ──────────────────────────────────────────────────
  // Every archived deck is owned by this one user. `users.email` is NOT NULL
  // and UNIQUE, so it carries a placeholder on `.invalid` — the reserved TLD
  // that can never resolve, so the address cannot receive mail even by
  // accident. No `accounts` row is created, which is what makes the identity
  // unauthenticatable: neither the credential nor the OAuth path can produce a
  // session without one.
  await sql`
    INSERT INTO users (id, email, name, email_verified)
    VALUES ('meta-archive', 'meta-archive@openrift.invalid', 'Meta Archive', false)
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  // ── meta_events ──────────────────────────────────────────────────────────
  await db.schema
    .createTable("meta_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    // A single date. Multi-day events store the start; the ADR omits any
    // multi-day representation on purpose.
    .addColumn("event_date", "date", (col) => col.notNull())
    .addColumn("format", "text", (col) => col.notNull())
    .addColumn("player_count", "integer")
    .addColumn("organizer", "text")
    .addColumn("source_url", "text")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    // Same slug grammar as friend groups and products: lowercase, 3–50 chars,
    // no leading hyphen. Mutable with no redirect — a renamed event 404s.
    .addCheckConstraint("chk_meta_events_slug", sql`slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'`)
    .addCheckConstraint("chk_meta_events_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint(
      "chk_meta_events_player_count",
      sql`player_count IS NULL OR player_count > 0`,
    )
    .addCheckConstraint(
      "chk_meta_events_organizer",
      sql`organizer IS NULL OR length(organizer) BETWEEN 1 AND 120`,
    )
    .addCheckConstraint(
      "chk_meta_events_source_url",
      sql`source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000`,
    )
    .addCheckConstraint("chk_meta_events_notes", sql`notes IS NULL OR length(notes) <= 4000`)
    .execute();

  await db.schema
    .alterTable("meta_events")
    .addUniqueConstraint("uq_meta_events_slug", ["slug"])
    .execute();

  // Same vocabulary as decks.format, enforced the same way decks and
  // tournaments enforce it, so the archive's format filters compose with the
  // deck builder's without a second list to keep in sync.
  await db.schema
    .alterTable("meta_events")
    .addForeignKeyConstraint("meta_events_format_fkey", ["format"], "deck_formats", ["slug"])
    .execute();

  // The overview page and the deck browser both sort newest-first.
  await sql`
    CREATE INDEX idx_meta_events_event_date ON meta_events (event_date DESC)
  `.execute(db);

  await db.schema
    .createIndex("idx_meta_events_format")
    .on("meta_events")
    .column("format")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── meta_decks ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("meta_decks")
    .addColumn("deck_id", "uuid", (col) => col.primaryKey())
    .addColumn("meta_event_id", "uuid", (col) => col.notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    // 1, 2, 3, 4, 8, 16, … Lower is better; equal tiers within an event are
    // ties. No upper bound: storing every deck of an arbitrarily large event
    // must stay possible, so the tier is any exact placement or cut bucket.
    .addColumn("finish_tier", "integer", (col) => col.notNull())
    .addColumn("record", "text")
    // How much of the player's list `deck_cards` actually holds. Sources publish
    // at three levels of detail, and conflating them would either throw away
    // usable data or quietly corrupt the stats:
    //
    //   'full'      the whole list.
    //   'partial'   the main deck is complete, the side zones (battlefields,
    //               runes, sideboard) may be missing. Card inclusion reads the
    //               main zone alone, so these count there in full.
    //   'archetype' the main deck is unknown; the rows are the legend and,
    //               when the source named one, the champion.
    //
    // All three count towards legend play-rate and the legend filters. Only
    // 'archetype' is left out of card inclusion, and only 'archetype' goes
    // without a share token — there is no list to render, so no public page.
    // A later upload or an admin edit can promote a deck, which is what mints
    // the token.
    .addColumn("list_status", "text", (col) => col.defaultTo("full").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_decks_player_name", sql`length(player_name) BETWEEN 1 AND 80`)
    .addCheckConstraint("chk_meta_decks_finish_tier", sql`finish_tier >= 1`)
    .addCheckConstraint(
      "chk_meta_decks_record",
      sql`record IS NULL OR length(record) BETWEEN 1 AND 20`,
    )
    .addCheckConstraint(
      "chk_meta_decks_list_status",
      sql`list_status IN ('full', 'partial', 'archetype')`,
    )
    .execute();

  await db.schema
    .alterTable("meta_decks")
    .addForeignKeyConstraint("meta_decks_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("meta_decks")
    .addForeignKeyConstraint("meta_decks_meta_event_id_fkey", ["meta_event_id"], "meta_events", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  // The event page lists its decks best-finish-first; this covers both the
  // lookup and the ordering.
  await db.schema
    .createIndex("idx_meta_decks_event_finish")
    .on("meta_decks")
    .columns(["meta_event_id", "finish_tier"])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

/**
 * Drops both archive tables and the decks the archive owned. The synthetic
 * user goes last, which is also what takes its `decks` rows with it.
 * @returns Resolves once the archive is removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("meta_decks").execute();
  await db.schema.dropTable("meta_events").execute();
  await sql`DELETE FROM users WHERE id = 'meta-archive'`.execute(db);
}
