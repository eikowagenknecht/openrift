import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 follow-up: every tournament takes place on a date, so starts_at is no
// longer optional. Existing rows with no date (legacy pod tournaments, and any
// migrated deck-check event whose event_date was blank) are backfilled to their
// creation time. A default of now() keeps the non-user-facing create paths
// (legacy pod create, deck-check createEvent) working; the creation wizard and
// the tournaments API always supply an explicit date.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE tournaments SET starts_at = created_at WHERE starts_at IS NULL`.execute(db);
  await sql`ALTER TABLE tournaments ALTER COLUMN starts_at SET DEFAULT now()`.execute(db);
  await sql`ALTER TABLE tournaments ALTER COLUMN starts_at SET NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments ALTER COLUMN starts_at DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tournaments ALTER COLUMN starts_at DROP DEFAULT`.execute(db);
}
