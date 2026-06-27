import type { Kysely } from "kysely";
import { sql } from "kysely";

// Drop the orphaned `trg_set_updated_at` trigger on `deck_cards`.
//
// Migration 001 created a `BEFORE UPDATE` trigger on `deck_cards` that runs
// `set_updated_at()` (which assigns `NEW.updated_at = now()`), but `deck_cards`
// has never had an `updated_at` column. The trigger was therefore broken from
// the start — it just never fired, because the only write path (the old
// `replaceCards` route) deletes and re-inserts deck-card rows and never UPDATEs
// them.
//
// ADR-027's synced deck builder adds `applyCards`, which upserts rows with
// `INSERT ... ON CONFLICT (...) DO UPDATE`. That UPDATE finally fires the
// trigger, which fails with `record "new" has no field "updated_at"` and turns
// every content-key-converging upsert into a 500.
//
// `deck_cards` does not need its own `updated_at`: the deck builder touches the
// parent `decks.updated_at` explicitly on every write, and Electric replicates
// row changes over logical replication without needing a timestamp column. So
// the fix is to remove the dead trigger rather than add an unused column (which
// would also change the synced deck-cards shape).

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON deck_cards`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore the (broken) trigger so the migration is reversible. It is a no-op
  // in practice because `deck_cards` has no `updated_at` column.
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}
