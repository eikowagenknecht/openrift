import type { Kysely } from "kysely";
import { sql } from "kysely";

// Deleting an account used to delete the other party's history with it.
// `card_trades.giver_user_id` and `receiver_user_id` both cascaded, so one
// person closing their account erased every completed trade from their
// counterparties' trade sheets — records of exchanges those counterparties took
// part in and had no say over.
//
// The fix is the shape `loans` already uses for an off-platform borrower: the
// party is either a live user reference or a snapshotted display name, never
// both, never neither. The FKs become ON DELETE SET NULL and a BEFORE DELETE
// trigger on `users` fills the name in.
//
// The trigger writes the snapshot and clears the user id in a *single* UPDATE
// per column pair. That is not a style preference: `chk_loans_borrower_shape`
// (tightened below) and the new `chk_card_trades_*_party_shape` forbid both
// columns being set at once, so splitting it into "write the name, then null the
// id" would fail on the intermediate row. Doing it in one statement means the
// constraint only ever sees the finished shape.
//
// The two `card_trades` snapshot updates target disjoint rows —
// `chk_card_trades_distinct_parties` rules out being both sides of one trade —
// so a row is only ever rewritten by one of them.
//
// The trigger also cancels the account's live trades before snapshotting, which
// is what leaving a friend group already does. That keeps "a trade with a
// missing party is terminal" true, so every action path can go on assuming both
// parties exist; what survives is finished history and nothing else.
//
// Only the borrower half of a loan is snapshotted. `loans.lender_user_id` still
// cascades, because a loan is the lender's own ledger entry and goes with them.
//
// `card_trades.group_id` keeps its cascade. Every trade surface, including the
// cross-group `/trades/$userId` sheet, is anchored on the group: the response
// carries a required `groupId`/`groupSlug`, and the counterparty's contact
// methods are resolved per group. A trade with no group has no name, no link and
// no contacts to show, so orphaning one would leave an unreachable row rather
// than preserved history. Deleting a group is also an explicit act by that
// group's owner over a shared workspace, unlike an unrelated third party closing
// their account.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE card_trades
      ALTER COLUMN giver_user_id DROP NOT NULL,
      ALTER COLUMN receiver_user_id DROP NOT NULL,
      ADD COLUMN giver_name text,
      ADD COLUMN receiver_name text
  `.execute(db);

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_giver_user_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_giver_user_id_fkey
    FOREIGN KEY (giver_user_id) REFERENCES users (id) ON DELETE SET NULL
  `.execute(db);

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_receiver_user_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_receiver_user_id_fkey
    FOREIGN KEY (receiver_user_id) REFERENCES users (id) ON DELETE SET NULL
  `.execute(db);

  await sql`
    ALTER TABLE card_trades
      ADD CONSTRAINT chk_card_trades_giver_party_shape
        CHECK (num_nonnulls(giver_user_id, giver_name) = 1),
      ADD CONSTRAINT chk_card_trades_receiver_party_shape
        CHECK (num_nonnulls(receiver_user_id, receiver_name) = 1),
      ADD CONSTRAINT chk_card_trades_giver_name_not_empty
        CHECK (giver_name IS NULL OR giver_name <> ''),
      ADD CONSTRAINT chk_card_trades_receiver_name_not_empty
        CHECK (receiver_name IS NULL OR receiver_name <> '')
  `.execute(db);

  // `loans` already allowed both columns to be NULL, which is what a borrower's
  // account deletion left behind before the trigger existed. With the snapshot
  // in place that state is unreachable, so the shape tightens to "exactly one".
  await sql`ALTER TABLE loans DROP CONSTRAINT chk_loans_borrower_shape`.execute(db);
  await sql`
    ALTER TABLE loans
    ADD CONSTRAINT chk_loans_borrower_shape CHECK (num_nonnulls(borrower_user_id, borrower_name) = 1)
  `.execute(db);

  // `users.name` is nullable, and the display fallback the app already shows for
  // a party it cannot name is "Former member", so the snapshot uses the same
  // words rather than inventing a second phrasing.
  await sql`
    CREATE FUNCTION snapshot_deleted_user_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      display_name text := COALESCE(NULLIF(OLD.name, ''), 'Former member');
    BEGIN
      -- A live trade needs two people. Close the ones this account was in
      -- before snapshotting, so no request or reservation is left waiting on
      -- somebody who is gone, and release the copies a reservation had pinned.
      -- This is what leaving a group already does to that member's live trades.
      DELETE FROM card_trade_copies
       WHERE trade_id IN (
         SELECT id FROM card_trades
          WHERE (giver_user_id = OLD.id OR receiver_user_id = OLD.id)
            AND status IN ('pending', 'reserved')
       );

      UPDATE card_trades
         SET status = 'cancelled',
             closed_at = now(),
             expires_at = NULL,
             last_actor_user_id = NULL
       WHERE (giver_user_id = OLD.id OR receiver_user_id = OLD.id)
         AND status IN ('pending', 'reserved');

      UPDATE card_trades
         SET giver_user_id = NULL, giver_name = display_name
       WHERE giver_user_id = OLD.id;

      UPDATE card_trades
         SET receiver_user_id = NULL, receiver_name = display_name
       WHERE receiver_user_id = OLD.id;

      UPDATE loans
         SET borrower_user_id = NULL, borrower_name = display_name
       WHERE borrower_user_id = OLD.id;

      RETURN OLD;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_snapshot_deleted_user_names
    BEFORE DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION snapshot_deleted_user_names()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_snapshot_deleted_user_names ON users`.execute(db);
  await sql`DROP FUNCTION IF EXISTS snapshot_deleted_user_names()`.execute(db);

  await sql`ALTER TABLE loans DROP CONSTRAINT chk_loans_borrower_shape`.execute(db);
  await sql`
    ALTER TABLE loans
    ADD CONSTRAINT chk_loans_borrower_shape
    CHECK (NOT (borrower_user_id IS NOT NULL AND borrower_name IS NOT NULL))
  `.execute(db);

  await sql`
    ALTER TABLE card_trades
      DROP CONSTRAINT chk_card_trades_giver_party_shape,
      DROP CONSTRAINT chk_card_trades_receiver_party_shape,
      DROP CONSTRAINT chk_card_trades_giver_name_not_empty,
      DROP CONSTRAINT chk_card_trades_receiver_name_not_empty
  `.execute(db);

  // Rows whose party was already snapshotted have no user to point back at, so
  // they cannot survive a column that is NOT NULL again.
  await sql`DELETE FROM card_trades WHERE giver_user_id IS NULL OR receiver_user_id IS NULL`.execute(
    db,
  );

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_receiver_user_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_receiver_user_id_fkey
    FOREIGN KEY (receiver_user_id) REFERENCES users (id) ON DELETE CASCADE
  `.execute(db);

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_giver_user_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_giver_user_id_fkey
    FOREIGN KEY (giver_user_id) REFERENCES users (id) ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE card_trades
      DROP COLUMN giver_name,
      DROP COLUMN receiver_name,
      ALTER COLUMN giver_user_id SET NOT NULL,
      ALTER COLUMN receiver_user_id SET NOT NULL
  `.execute(db);
}
