import type { Kysely } from "kysely";
import { sql } from "kysely";

// A second, read-only follow-along token. `report_token` stays the result
// reporting link (follow + enter results); `follow_token` is follow-only — the
// public report surface resolves either, but rejects result submission unless
// the request arrived on the report token. Nullable + unique-where-not-null,
// mirroring `report_token`.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments ADD COLUMN follow_token text`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_tournaments_follow_token ON tournaments USING btree (follow_token) WHERE (follow_token IS NOT NULL)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX uq_tournaments_follow_token`.execute(db);
  await sql`ALTER TABLE tournaments DROP COLUMN follow_token`.execute(db);
}
