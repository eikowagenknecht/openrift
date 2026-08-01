import type { Kysely } from "kysely";
import { sql } from "kysely";

// Stop `collection_events` rewriting its own history.
//
// The table is an append-only log, but its three references carried
// ON DELETE SET NULL. Deleting a collection or a copy reached back and erased
// the ids from every event that mentioned it, keeping only the name snapshot.
// Migration 140 fixed the rows surviving a collection delete and missed that
// their ids do not.
//
// What that cost:
//
//   * 14194 `added` and 16350 `moved` events across 13 accounts have lost a
//     collection id. The value-over-time replay reads those ids to decide
//     whether an event enters or leaves the collection being charted, so a
//     scoped chart drifts for anyone who has ever deleted a collection.
//
//   * 6573 `removed` events across 8 accounts have no matching `added`. Their
//     copies predate event logging, and because `copy_id` was nulled on
//     delete there is no key left to pair them up or to backfill from.
//
// Neither is recoverable — the ids are gone and nothing else recorded them.
// Dropping the constraints only stops the bleeding, and that is the point: a
// history table should hold values, not live references. The columns stay
// `uuid` and keep their indexes; readers already tolerate a missing target
// (`collectionEventsRepo.listForUser` selects the ids without joining them,
// and the activity feed uses them only as grouping keys and filter
// comparisons, both of which treat an unmatched id exactly like a null).
//
// The name snapshots stay authoritative for display. They already are: the
// check constraint from migration 140 accepts a row carrying only a name.

const CONSTRAINTS = [
  "fk_collection_events_from_collection",
  "fk_collection_events_to_collection",
  "fk_collection_events_copy",
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const name of CONSTRAINTS) {
    await sql`ALTER TABLE collection_events DROP CONSTRAINT IF EXISTS ${sql.raw(name)}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Lossy. Re-adding the constraints requires every reference to resolve, so
  // any id recorded after `up` that now points at a deleted row has to be
  // nulled first — exactly the erasure this migration exists to prevent.
  await sql`
    UPDATE collection_events ce
    SET from_collection_id = NULL
    WHERE ce.from_collection_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.id = ce.from_collection_id)
  `.execute(db);
  await sql`
    UPDATE collection_events ce
    SET to_collection_id = NULL
    WHERE ce.to_collection_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.id = ce.to_collection_id)
  `.execute(db);
  await sql`
    UPDATE collection_events ce
    SET copy_id = NULL
    WHERE ce.copy_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM copies cp WHERE cp.id = ce.copy_id)
  `.execute(db);

  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_from_collection
        FOREIGN KEY (from_collection_id) REFERENCES collections(id) ON DELETE SET NULL
  `.execute(db);
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_to_collection
        FOREIGN KEY (to_collection_id) REFERENCES collections(id) ON DELETE SET NULL
  `.execute(db);
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_copy
        FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE SET NULL
  `.execute(db);
}
