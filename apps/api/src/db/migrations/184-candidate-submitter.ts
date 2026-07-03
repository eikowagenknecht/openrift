import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Adds submitter attribution to `candidate_cards` for in-app user submissions
 * (ADR-036).
 *
 * User submissions flow into the same candidate pipeline as admin-uploaded
 * sources under `provider = 'usersubmission'`. These two columns record who
 * sent a candidate and their free-text note, so the admin can attribute a
 * submission, throttle a user (per-user daily cap counts rows here), and ban an
 * abuser. Both are nullable: candidates ingested from other providers have no
 * submitter.
 *
 * `submitted_by_user_id` references `users(id)` with `ON DELETE SET NULL` so
 * deleting a user leaves their pending candidates in the review queue rather
 * than cascading them away. It is TEXT to match `users.id` (better-auth stores
 * ids as text, not uuid), and indexed for the per-user daily-cap count.
 *
 * @returns Resolves once the columns, FK, index and CHECK are in place.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE candidate_cards
      ADD COLUMN submitted_by_user_id TEXT
        REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN submission_note TEXT
        CHECK (submission_note <> '');

    CREATE INDEX idx_candidate_cards_submitted_by_user_id
      ON candidate_cards (submitted_by_user_id)
      WHERE submitted_by_user_id IS NOT NULL
  `.execute(db);
}

/**
 * @returns Resolves once the submitter columns are removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS idx_candidate_cards_submitted_by_user_id;

    ALTER TABLE candidate_cards
      DROP COLUMN submission_note,
      DROP COLUMN submitted_by_user_id
  `.execute(db);
}
