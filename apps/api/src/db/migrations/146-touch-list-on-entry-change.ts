import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Keep a list's `updated_at` in step with its entries so derived caches —
 * notably the share-image content version (ADR-024) — invalidate on every entry
 * change. A DB trigger is used rather than touching the parent in the app layer
 * because the app layer is blind to FK-cascade deletes: disposing a copy
 * cascade-removes its copy-kind tradelist entry (`fk_list_entries_copy` ON
 * DELETE CASCADE), and completing a trade does the same, neither of which runs
 * through an explicit `deleteEntry` call.
 *
 * Per-row (not statement-level with transition tables) so it reliably fires for
 * cascade-induced deletes. Bulk inserts therefore touch the parent once per row
 * (within `now()`, the parent stamp is identical) — acceptable at personal-list
 * scale; revisit with a statement-level trigger if bulk imports grow large.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION touch_list_on_entry_change() RETURNS trigger AS $$
    BEGIN
      UPDATE lists SET updated_at = now()
      WHERE id = COALESCE(NEW.list_id, OLD.list_id);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_touch_list_on_entry_change
      AFTER INSERT OR UPDATE OR DELETE ON list_entries
      FOR EACH ROW EXECUTE FUNCTION touch_list_on_entry_change()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_touch_list_on_entry_change ON list_entries`.execute(db);
  await sql`DROP FUNCTION IF EXISTS touch_list_on_entry_change()`.execute(db);
}
