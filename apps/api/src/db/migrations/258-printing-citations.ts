import type { Kysely } from "kysely";
import { sql } from "kysely";

// Promo printings carry claims nothing backs up: which event handed a card out,
// how big the print run was, that a signed variant exists at all. Today the only
// prose is `printing_distribution_channels.distribution_note` and
// `printings.comment`, and a reader has no way to check either.
//
// This is ADR-014's `meta_event_sources` shape applied to a printing: a free
// label, an optional link, ordered by hand. It is deliberately NOT called
// `printing_sources` — in this codebase a "printing source" is already a
// candidate row from a provider ingest (`candidate_printings`, the admin's
// `PrintingSourceActions`), and a second meaning for the phrase would be read
// wrong in every file that touches both. The reader-facing word stays "Sources",
// as it is on the meta event page.
//
// The citation hangs off the printing, not off the channel link. An event VOD
// covering a dozen promos is therefore cited a dozen times, which is the cost of
// letting one printing's claims travel with the printing when it gains or loses
// a channel.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("printing_citations")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("source_url", "text")
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    // Wider than meta's 60: a promo citation names the video AND its channel
    // ("Riftbound launch party unboxing (RiftboundDaily)"), where an event
    // citation only ever names a provider.
    .addCheckConstraint(
      "chk_printing_citations_label",
      sql`length(label) >= 1 AND length(label) <= 120`,
    )
    .addCheckConstraint(
      "chk_printing_citations_source_url",
      sql`source_url IS NULL OR (length(source_url) >= 1 AND length(source_url) <= 2000)`,
    )
    .execute();

  await db.schema
    .alterTable("printing_citations")
    .addForeignKeyConstraint("printing_citations_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  // Covers the only read there is: every citation of a printing, in display
  // order. `id` breaks the tie so a page of same-`sort_order` rows cannot
  // reshuffle between two requests.
  await db.schema
    .createIndex("idx_printing_citations_printing")
    .on("printing_citations")
    .columns(["printing_id", "sort_order", "id"])
    .execute();

  // One link is cited once per printing. Partial, so the URL-less citations (an
  // admin transcribing from a stream nobody archived) stay unconstrained — they
  // have no key to collide on.
  await sql`
    CREATE UNIQUE INDEX uq_printing_citations_url
        ON printing_citations (printing_id, source_url)
     WHERE source_url IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("printing_citations").execute();
}
