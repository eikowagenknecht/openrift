import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deck-check entry lifecycle states (ADR-027). Replaces the single
// `check_status` verdict with an explicit `state` (editable / submitted /
// approved / checked / withdrawn) plus a `review_outcome`, adds the pre-event
// approval fields and the unlock-request marker, and removes the ADR-026
// edit-takeover bookkeeping (provider pushes now always win).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("state", "text", (col) => col.defaultTo("submitted").notNull())
    .addColumn("review_outcome", "text")
    .addColumn("approved_by", "text")
    .addColumn("approved_at", "timestamptz")
    // Player request to unlock an approved entry; a judge grants or declines.
    .addColumn("unlock_requested_at", "timestamptz")
    // The list as the judge last saw it, diffed against on resubmission.
    .addColumn("pre_edit_lines", "jsonb")
    .execute();

  await sql`
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT chk_deck_check_entries_state
        CHECK (state = ANY (ARRAY['editable'::text, 'submitted'::text, 'approved'::text, 'checked'::text, 'withdrawn'::text])),
      ADD CONSTRAINT chk_deck_check_entries_review_outcome
        CHECK (review_outcome IS NULL OR review_outcome = ANY (ARRAY['ok'::text, 'issue'::text]))
  `.execute(db);

  // Backfill from the ADR-025 verdict: a withdrawn entry is 'withdrawn'
  // regardless of its old verdict; 'checked' and 'issue' were both event-day
  // verdicts and map to state 'checked' with the matching outcome.
  await sql`
    UPDATE deck_check_entries
       SET state = CASE
             WHEN withdrawn_at IS NOT NULL THEN 'withdrawn'
             WHEN check_status IN ('checked', 'issue') THEN 'checked'
             ELSE 'submitted'
           END,
           review_outcome = CASE
             WHEN check_status = 'checked' THEN 'ok'
             WHEN check_status = 'issue' THEN 'issue'
             ELSE NULL
           END
  `.execute(db);

  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("check_status")
    .dropColumn("list_owner")
    .dropColumn("provider_push_ignored_at")
    .execute();

  // When a submitted list locks (TR 401.3): on submission (strict default) or
  // only at the close of the registration window (casual leagues).
  await db.schema
    .alterTable("deck_check_events")
    .addColumn("list_lock_mode", "text", (col) => col.defaultTo("on_submit").notNull())
    .execute();
  await sql`
    ALTER TABLE deck_check_events
      ADD CONSTRAINT chk_deck_check_events_list_lock_mode
        CHECK (list_lock_mode = ANY (ARRAY['on_submit'::text, 'at_deadline'::text]))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("deck_check_events").dropColumn("list_lock_mode").execute();

  await db.schema
    .alterTable("deck_check_entries")
    .addColumn("check_status", "text", (col) => col.defaultTo("unchecked").notNull())
    .addColumn("list_owner", "text", (col) => col.defaultTo("provider").notNull())
    .addColumn("provider_push_ignored_at", "timestamptz")
    .execute();

  await sql`
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT chk_deck_check_entries_status
        CHECK (check_status = ANY (ARRAY['unchecked'::text, 'checked'::text, 'issue'::text])),
      ADD CONSTRAINT chk_deck_check_entries_list_owner
        CHECK (list_owner = ANY (ARRAY['provider'::text, 'player'::text]))
  `.execute(db);

  await sql`
    UPDATE deck_check_entries
       SET check_status = CASE
             WHEN state = 'checked' AND review_outcome = 'issue' THEN 'issue'
             WHEN state = 'checked' THEN 'checked'
             ELSE 'unchecked'
           END
  `.execute(db);

  await db.schema
    .alterTable("deck_check_entries")
    .dropColumn("state")
    .dropColumn("review_outcome")
    .dropColumn("approved_by")
    .dropColumn("approved_at")
    .dropColumn("unlock_requested_at")
    .dropColumn("pre_edit_lines")
    .execute();
}
