import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Per-card deck copy-limit override for cards whose rules text changes how
 * many copies a deck may run (e.g. "Your deck can have any number of cards
 * named ..."). NULL means the normal format rules apply (3 copies), a
 * positive value caps at that many copies, and 0 is the sentinel for
 * "unlimited" (see UNLIMITED_COPIES in @openrift/shared deck-rules).
 * Admin-curated via the card editor, like `comment`.
 *
 * @returns Resolves once the column exists.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards
      ADD COLUMN max_copies_override smallint CHECK (max_copies_override >= 0)
  `.execute(db);
}

/** @returns Resolves once the column is dropped. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards DROP COLUMN IF EXISTS max_copies_override
  `.execute(db);
}
