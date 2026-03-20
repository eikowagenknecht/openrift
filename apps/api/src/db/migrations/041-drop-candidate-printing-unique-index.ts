import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS idx_candidate_printings_candidate_card_printing
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX idx_candidate_printings_candidate_card_printing
    ON candidate_printings (candidate_card_id, printing_id)
    WHERE printing_id IS NOT NULL
  `.execute(db);
}
