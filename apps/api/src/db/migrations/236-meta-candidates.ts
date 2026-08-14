import type { Kysely } from "kysely";
import { sql } from "kysely";

// Candidate ingest for the meta archive (ADR-014), layered on migration 235.
//
// External tooling pushes `{ provider, events: [...] }`; nothing reaches the
// live tables without an admin accepting it. The staging pair mirrors the
// ADR-008 card pipeline: `(provider, external_id)` is the source's stable key,
// `checked_at` records "an admin looked at this" and resets whenever an upload
// changes the row, and an ignore table keyed on the same pair makes a rejection
// stick across re-uploads.
//
// Two deliberate differences from the live tables:
//
//   * `format` gets no FK to `deck_formats` here. A candidate carries whatever
//     the source called the format; a value we don't know is a review finding,
//     not a reason to reject the whole upload.
//   * Deck card lists are jsonb on the candidate rather than a third staging
//     table. They are written whole and read whole, and a candidate's cards are
//     never queried across rows.
//
// `ignored_candidate_meta_decks` is keyed `(provider, event_external_id,
// external_id)`. A deck external id is only unique within its own event — real
// sources number their lists per event — so a provider-level key would make
// ignoring deck "1" of one event silently skip deck "1" of every other. The key
// deliberately names the source's event id rather than the candidate row, so an
// ignored deck stays ignored even after its event candidate is deleted and
// re-created by a later upload.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── candidate_meta_events ────────────────────────────────────────────────
  await db.schema
    .createTable("candidate_meta_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("event_date", "date", (col) => col.notNull())
    .addColumn("format", "text", (col) => col.notNull())
    .addColumn("player_count", "integer")
    .addColumn("organizer", "text")
    .addColumn("source_url", "text")
    .addColumn("notes", "text")
    // The live event this candidate was accepted into, matched back by the
    // source key. ON DELETE SET NULL so deleting the live row returns the
    // candidate to the queue as a fresh proposal rather than orphaning it.
    .addColumn("meta_event_id", "uuid")
    .addColumn("checked_at", "timestamptz")
    // Source fields that map to no column of ours, kept so a later mapping
    // change can use them without a re-scrape.
    .addColumn("extra_data", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_candidate_meta_events_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_candidate_meta_events_external_id", sql`external_id <> ''`)
    // Same bounds as meta_events, minus the slug (assigned at accept time).
    .addCheckConstraint("chk_candidate_meta_events_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint("chk_candidate_meta_events_format", sql`format <> ''`)
    .addCheckConstraint(
      "chk_candidate_meta_events_player_count",
      sql`player_count IS NULL OR player_count > 0`,
    )
    .addCheckConstraint(
      "chk_candidate_meta_events_organizer",
      sql`organizer IS NULL OR length(organizer) BETWEEN 1 AND 120`,
    )
    .addCheckConstraint(
      "chk_candidate_meta_events_source_url",
      sql`source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000`,
    )
    .addCheckConstraint(
      "chk_candidate_meta_events_notes",
      sql`notes IS NULL OR length(notes) <= 4000`,
    )
    .execute();

  await db.schema
    .alterTable("candidate_meta_events")
    .addUniqueConstraint("uq_candidate_meta_events_source", ["provider", "external_id"])
    .execute();

  await db.schema
    .alterTable("candidate_meta_events")
    .addForeignKeyConstraint(
      "candidate_meta_events_meta_event_id_fkey",
      ["meta_event_id"],
      "meta_events",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── candidate_meta_decks ─────────────────────────────────────────────────
  await db.schema
    .createTable("candidate_meta_decks")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("candidate_event_id", "uuid", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    .addColumn("finish_tier", "integer", (col) => col.notNull())
    .addColumn("record", "text")
    // Nullable: most sources don't name their lists. Accept derives one from
    // the legend and the pilot when it is still missing.
    .addColumn("name", "text")
    // [{ name, zone, quantity, cardId | null }] — cardId is the shared
    // name-matcher's verdict, null while the name resolves to nothing.
    .addColumn("cards", "jsonb", (col) => col.notNull())
    // How much of the list the source says `cards` holds — same vocabulary and
    // same meaning as `meta_decks.list_status`, which accepting copies it into.
    // Never inferred from the card count: a short list, a list missing its
    // battlefields, and a deliberate archetype are three different statements,
    // and only the source can tell them apart.
    .addColumn("list_status", "text", (col) => col.defaultTo("full").notNull())
    .addColumn("deck_id", "uuid")
    .addColumn("checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_candidate_meta_decks_external_id", sql`external_id <> ''`)
    .addCheckConstraint(
      "chk_candidate_meta_decks_player_name",
      sql`length(player_name) BETWEEN 1 AND 80`,
    )
    .addCheckConstraint("chk_candidate_meta_decks_finish_tier", sql`finish_tier >= 1`)
    .addCheckConstraint(
      "chk_candidate_meta_decks_record",
      sql`record IS NULL OR length(record) BETWEEN 1 AND 20`,
    )
    .addCheckConstraint(
      "chk_candidate_meta_decks_name",
      sql`name IS NULL OR length(name) BETWEEN 1 AND 120`,
    )
    .addCheckConstraint(
      "chk_candidate_meta_decks_list_status",
      sql`list_status IN ('full', 'partial', 'archetype')`,
    )
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addUniqueConstraint("uq_candidate_meta_decks_source", ["candidate_event_id", "external_id"])
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint(
      "candidate_meta_decks_candidate_event_id_fkey",
      ["candidate_event_id"],
      "candidate_meta_events",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint("candidate_meta_decks_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("set null")
    .execute();

  // The queue reads a candidate event's decks together, always.
  await db.schema
    .createIndex("idx_candidate_meta_decks_event")
    .on("candidate_meta_decks")
    .column("candidate_event_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_meta_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── Ignore lists ─────────────────────────────────────────────────────────
  // Skip-at-ingest, so a rejected event or deck never resurfaces. No id column:
  // the source key is the identity, and the composite PK makes the re-ignore a
  // plain ON CONFLICT DO NOTHING.
  await db.schema
    .createTable("ignored_candidate_meta_events")
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("ignored_candidate_meta_events_pkey", ["provider", "external_id"])
    .addCheckConstraint("chk_ignored_candidate_meta_events_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_ignored_candidate_meta_events_external_id", sql`external_id <> ''`)
    .execute();

  await db.schema
    .createTable("ignored_candidate_meta_decks")
    .addColumn("provider", "text", (col) => col.notNull())
    // The source's id for the deck's *event*, not the candidate event row: the
    // candidate can be deleted and re-created, the source key cannot.
    .addColumn("event_external_id", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("ignored_candidate_meta_decks_pkey", [
      "provider",
      "event_external_id",
      "external_id",
    ])
    .addCheckConstraint("chk_ignored_candidate_meta_decks_provider", sql`provider <> ''`)
    .addCheckConstraint(
      "chk_ignored_candidate_meta_decks_event_external_id",
      sql`event_external_id <> ''`,
    )
    .addCheckConstraint("chk_ignored_candidate_meta_decks_external_id", sql`external_id <> ''`)
    .execute();

  // ── Source columns on the live tables ────────────────────────────────────
  // Written at accept time. They are what lets a later upload find the live row
  // its candidate became, so the queue can show a diff instead of proposing a
  // duplicate. Hand-entered rows leave them NULL, which the partial unique
  // indexes below exempt.
  for (const table of ["meta_events", "meta_decks"]) {
    await db.schema.alterTable(table).addColumn("source_provider", "text").execute();
    await db.schema.alterTable(table).addColumn("source_external_id", "text").execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`chk_${table}_source_provider`, sql`source_provider <> ''`)
      .execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`chk_${table}_source_external_id`, sql`source_external_id <> ''`)
      .execute();
  }

  // A deck's source key needs its event's id too: deck external ids are scoped
  // to their event, so `(provider, deck id)` alone collides the moment two
  // events number their lists from one.
  await db.schema.alterTable("meta_decks").addColumn("source_event_external_id", "text").execute();
  await db.schema
    .alterTable("meta_decks")
    .addCheckConstraint(
      "chk_meta_decks_source_event_external_id",
      sql`source_event_external_id <> ''`,
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_meta_events_source
      ON meta_events (source_provider, source_external_id)
      WHERE source_provider IS NOT NULL AND source_external_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_decks_source
      ON meta_decks (source_provider, source_event_external_id, source_external_id)
      WHERE source_provider IS NOT NULL
        AND source_event_external_id IS NOT NULL
        AND source_external_id IS NOT NULL
  `.execute(db);
}

/**
 * Drops the staging and ignore tables and the live tables' source columns.
 * Children first, so no FK blocks the parent drop.
 * @returns Resolves once the candidate pipeline is removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("candidate_meta_decks").execute();
  await db.schema.dropTable("candidate_meta_events").execute();
  await db.schema.dropTable("ignored_candidate_meta_decks").execute();
  await db.schema.dropTable("ignored_candidate_meta_events").execute();

  await db.schema.alterTable("meta_decks").dropColumn("source_event_external_id").execute();
  for (const table of ["meta_events", "meta_decks"]) {
    await db.schema.alterTable(table).dropColumn("source_provider").execute();
    await db.schema.alterTable(table).dropColumn("source_external_id").execute();
  }
}
