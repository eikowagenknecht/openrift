import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Pre-stable-release schema hardening. Three independent, low-risk pieces:
 *
 * 1. `users (lower(email))` unique index. better-auth lowercases the email on
 *    every path today (sign-up, change-email, OAuth), so this is insurance:
 *    it makes the DB guarantee what `usersRepo.findIdByEmail` (which matches
 *    on `lower(email)`) already assumes, against future library changes or
 *    manual inserts. Cheap now, expensive to retrofit once case-variant
 *    duplicates exist.
 *
 * 2. Covering indexes for FK columns that are scanned on hot deletion or
 *    lookup paths but had no index (Postgres doesn't index FK columns
 *    automatically). The worst offender: every trade completion disposes
 *    copies, and each copy delete seq-scanned `list_entries` for `copy_id`.
 *    Partial (`IS NOT NULL`) where the column is nullable, matching the
 *    existing index style.
 *
 * 3. `deck_check_entries.approved_by` gets the same `ON DELETE SET NULL` FK
 *    its sibling `checked_by` already has, instead of dangling after the
 *    approving user is deleted. Rows already dangling are nulled first.
 *
 * @returns Resolves once the indexes and FK are in place.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

    CREATE INDEX idx_list_entries_copy ON list_entries (copy_id)
      WHERE copy_id IS NOT NULL;
    CREATE INDEX idx_collection_events_from_collection ON collection_events (from_collection_id)
      WHERE from_collection_id IS NOT NULL;
    CREATE INDEX idx_collection_events_to_collection ON collection_events (to_collection_id)
      WHERE to_collection_id IS NOT NULL;
    CREATE INDEX idx_tournament_participants_user ON tournament_participants (user_id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX idx_deck_check_entries_participant ON deck_check_entries (participant_id)
      WHERE participant_id IS NOT NULL;
    CREATE INDEX idx_deck_check_keys_host_user ON deck_check_keys (host_user_id)
      WHERE host_user_id IS NOT NULL;
    CREATE INDEX idx_deck_check_keys_host_org ON deck_check_keys (host_org_id)
      WHERE host_org_id IS NOT NULL;
    CREATE INDEX idx_card_trades_receiver_wish_entry ON card_trades (receiver_wish_entry_id)
      WHERE receiver_wish_entry_id IS NOT NULL;
    CREATE INDEX idx_organizations_owner ON organizations (owner_user_id);

    UPDATE deck_check_entries
      SET approved_by = NULL
      WHERE approved_by IS NOT NULL
        AND approved_by NOT IN (SELECT id FROM users);
    ALTER TABLE deck_check_entries
      ADD CONSTRAINT deck_check_entries_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  `.execute(db);
}

/**
 * @returns Resolves once the indexes and FK are removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deck_check_entries
      DROP CONSTRAINT deck_check_entries_approved_by_fkey;

    DROP INDEX IF EXISTS idx_organizations_owner;
    DROP INDEX IF EXISTS idx_card_trades_receiver_wish_entry;
    DROP INDEX IF EXISTS idx_deck_check_keys_host_org;
    DROP INDEX IF EXISTS idx_deck_check_keys_host_user;
    DROP INDEX IF EXISTS idx_deck_check_entries_participant;
    DROP INDEX IF EXISTS idx_tournament_participants_user;
    DROP INDEX IF EXISTS idx_collection_events_to_collection;
    DROP INDEX IF EXISTS idx_collection_events_from_collection;
    DROP INDEX IF EXISTS idx_list_entries_copy;
    DROP INDEX IF EXISTS uq_users_email_lower
  `.execute(db);
}
