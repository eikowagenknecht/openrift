import type { Kysely } from "kysely";
import { sql } from "kysely";

// Claim tokens for deck checks (ADR-026 amendment). A provider-issued,
// per-entry capability the provider embeds in its own confirmation email so a
// player can register at OpenRift and reach their own deck, with no dependence
// on OpenRift ever seeing the player's email. Adds the third linking source
// `claim_link`.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("claim_token", "text", (col) => col.unique())
    .execute();

  // Backfill every existing entry so already-pushed events produce working
  // links without recreating their entries. gen_random_uuid() is built-in (no
  // pgcrypto); the dashes are stripped to keep the token URL-clean. New entries
  // get a base62 token from generateShareToken() at create time instead.
  await sql`
    UPDATE deck_check_entries
       SET claim_token = replace(gen_random_uuid()::text, '-', '')
     WHERE claim_token IS NULL
  `.execute(db);

  // The claim_source check gains the third linking source.
  await sql`
    ALTER TABLE deck_check_entries
      DROP CONSTRAINT chk_deck_check_entries_claim_source,
      ADD CONSTRAINT chk_deck_check_entries_claim_source
        CHECK (claim_source IS NULL OR claim_source = ANY (ARRAY['email_auto'::text, 'judge_manual'::text, 'self_submit'::text, 'claim_link'::text]))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deck_check_entries
      DROP CONSTRAINT chk_deck_check_entries_claim_source,
      ADD CONSTRAINT chk_deck_check_entries_claim_source
        CHECK (claim_source IS NULL OR claim_source = ANY (ARRAY['email_auto'::text, 'judge_manual'::text, 'self_submit'::text]))
  `.execute(db);

  await db.schema.alterTable("deck_check_entries").dropColumn("claim_token").execute();
}
