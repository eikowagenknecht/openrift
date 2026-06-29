import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 follow-up: a tournament participant is either a linked OpenRift account
// (the gold-standard identity) or an accountless walk-in claimed through its
// claim link. There is no "email but no account" state, so the email column and
// the email-based auto-match it fed are removed. Existing `email_auto` links
// (accounts matched by email at ingest) become `self_submit` — they are still a
// real account link, just no longer labelled by how it happened.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE tournament_participants SET claim_source = 'self_submit' WHERE claim_source = 'email_auto'
  `.execute(db);
  await sql`ALTER TABLE tournament_participants DROP CONSTRAINT chk_tournament_participants_claim_source`.execute(
    db,
  );
  await sql`
    ALTER TABLE tournament_participants
      ADD CONSTRAINT chk_tournament_participants_claim_source
      CHECK (claim_source IS NULL OR claim_source = ANY (ARRAY['judge_manual'::text, 'self_submit'::text, 'claim_link'::text]))
  `.execute(db);
  await sql`ALTER TABLE tournament_participants DROP CONSTRAINT chk_tournament_participants_email`.execute(
    db,
  );
  await sql`ALTER TABLE tournament_participants DROP COLUMN email`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournament_participants ADD COLUMN email text`.execute(db);
  await sql`
    ALTER TABLE tournament_participants
      ADD CONSTRAINT chk_tournament_participants_email
      CHECK (email IS NULL OR length(email) <= 254)
  `.execute(db);
  await sql`ALTER TABLE tournament_participants DROP CONSTRAINT chk_tournament_participants_claim_source`.execute(
    db,
  );
  await sql`
    ALTER TABLE tournament_participants
      ADD CONSTRAINT chk_tournament_participants_claim_source
      CHECK (claim_source IS NULL OR claim_source = ANY (ARRAY['email_auto'::text, 'judge_manual'::text, 'self_submit'::text, 'claim_link'::text]))
  `.execute(db);
}
