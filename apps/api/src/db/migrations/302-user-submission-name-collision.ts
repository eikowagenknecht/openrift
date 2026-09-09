import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * `idx_candidate_cards_provider_name_no_sid` dedupes a provider feed with no
 * stable id. User submissions have no short code and share one provider, so
 * it blocked every repeat name; they're already deduped by `external_id`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_candidate_cards_provider_name_no_sid`.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_name_no_sid
      ON candidate_cards (provider, name)
      WHERE short_code IS NULL AND provider <> 'usersubmission'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_candidate_cards_provider_name_no_sid`.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_name_no_sid
      ON candidate_cards (provider, name)
      WHERE short_code IS NULL
  `.execute(db);
}
