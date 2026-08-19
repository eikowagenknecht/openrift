import type { Kysely } from "kysely";
import { sql } from "kysely";

// Migration 255 dropped `meta_decks.source_provider` / `source_event_external_id`
// / `source_external_id` and left `candidate_meta_decks` as the only row that
// knows which source deck an archived deck came from. That works while the
// candidate exists, and breaks the moment it does not: ignoring a deck deletes
// the candidate row, so un-ignoring it and re-uploading finds no live deck,
// stages the same list as new, and accepting it archives a *second* copy of one
// pilot's deck.
//
// Events do not have the hole because migration 255 gave them
// `meta_event_sources`, which keeps `(provider, external_id)` independently of
// any candidate. This is the same table for decks.
//
// It carries no label and no URL: a deck prints no citation of its own — its
// event's citation list covers it — so the row exists only to keep the source
// key. Rows are written for provider ingest, never for a user submission, which
// hangs off a live event and has no source event to key on.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("meta_deck_sources")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("event_external_id", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_deck_sources_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_meta_deck_sources_event_external_id", sql`event_external_id <> ''`)
    .addCheckConstraint("chk_meta_deck_sources_external_id", sql`external_id <> ''`)
    .execute();

  await db.schema
    .alterTable("meta_deck_sources")
    .addForeignKeyConstraint("meta_deck_sources_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_meta_deck_sources_deck")
    .on("meta_deck_sources")
    .column("deck_id")
    .execute();

  // One provider names one deck of one of its events once, which is what makes
  // the key a lookup: relinking that source to another archived deck moves the
  // row rather than adding a second.
  await db.schema
    .createIndex("uq_meta_deck_sources_key")
    .unique()
    .on("meta_deck_sources")
    .columns(["provider", "event_external_id", "external_id"])
    .execute();

  // Backfill from the links that exist today. Every archived deck reachable
  // through a provider candidate gets its key back, so an ignore issued after
  // this migration still finds the live deck.
  await sql`
    INSERT INTO meta_deck_sources (deck_id, provider, event_external_id, external_id)
    SELECT DISTINCT ON (ce.provider, ce.external_id, cd.external_id)
           cd.deck_id, ce.provider, ce.external_id, cd.external_id
      FROM candidate_meta_decks cd
      JOIN candidate_meta_events ce ON ce.id = cd.candidate_event_id
     WHERE cd.deck_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("meta_deck_sources").execute();
}
