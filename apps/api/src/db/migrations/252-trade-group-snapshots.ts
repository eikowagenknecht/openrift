import type { Kysely } from "kysely";
import { sql } from "kysely";

// The last way a trade could be deleted out from under the person who took part
// in it. `card_trades.group_id` cascaded, so an owner deleting a friend group
// erased every completed trade inside it — from both members' trade sheets, not
// just the owner's. The `/trades/$userId` sheet pools finished trades across
// every shared group, so this silently rewrote history the other person had no
// say over. Migration 248 fixed the same shape for account deletion; this is the
// group half.
//
// The group reference gets the treatment the trade parties got: either a live
// group or the name it had when it was deleted, never both, never neither.
// `chk_card_trades_group_shape` states that, and it holds because the trigger
// below snapshots *every* trade in the group, not only the terminal ones — the
// live ones are cancelled first and then snapshotted by the same statement.
//
// Trigger order matters and is the whole reason this is three statements:
//
//   1. Release the reservation pins of the group's live trades. They have to go
//      while `group_id` still identifies which trades those are.
//   2. Cancel those live trades. A trade is an agreement inside a group; with
//      the group gone there is no venue left to complete it in, and leaving a
//      pending request addressed to a group that no longer exists would strand
//      the giver's copies. This is what leaving a group already does to a
//      departing member's live trades.
//   3. Swap `group_id` for `group_name` across every remaining trade of the
//      group, in ONE statement, so the CHECK never sees a row with neither set.
//      Step 2 leaves rows with `group_id` still set and `group_name` still NULL,
//      which satisfies the CHECK on its own, so there is no transient violation
//      between the statements either.
//
// The FK becomes ON DELETE SET NULL, which by then has nothing left to do: the
// trigger has already emptied every `group_id` the deleted group owned.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE card_trades
      ALTER COLUMN group_id DROP NOT NULL,
      ADD COLUMN group_name text
  `.execute(db);

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_group_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES friend_groups (id) ON DELETE SET NULL
  `.execute(db);

  await sql`
    ALTER TABLE card_trades
      ADD CONSTRAINT chk_card_trades_group_shape CHECK (num_nonnulls(group_id, group_name) = 1),
      ADD CONSTRAINT chk_card_trades_group_name_not_empty
        CHECK (group_name IS NULL OR group_name <> '')
  `.execute(db);

  await sql`
    CREATE FUNCTION snapshot_deleted_group_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      DELETE FROM card_trade_copies
       WHERE trade_id IN (
         SELECT id FROM card_trades
          WHERE group_id = OLD.id AND status IN ('pending', 'reserved')
       );

      UPDATE card_trades
         SET status = 'cancelled',
             closed_at = now(),
             expires_at = NULL,
             last_actor_user_id = NULL
       WHERE group_id = OLD.id
         AND status IN ('pending', 'reserved');

      UPDATE card_trades
         SET group_id = NULL, group_name = OLD.name
       WHERE group_id = OLD.id;

      RETURN OLD;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_snapshot_deleted_group_names
    BEFORE DELETE ON friend_groups
    FOR EACH ROW EXECUTE FUNCTION snapshot_deleted_group_names()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_snapshot_deleted_group_names ON friend_groups`.execute(db);
  await sql`DROP FUNCTION IF EXISTS snapshot_deleted_group_names()`.execute(db);

  await sql`
    ALTER TABLE card_trades
      DROP CONSTRAINT chk_card_trades_group_shape,
      DROP CONSTRAINT chk_card_trades_group_name_not_empty
  `.execute(db);

  // A snapshotted trade has no group to point back at, so it cannot survive a
  // column that is NOT NULL again — the same trade-off migration 248's rollback
  // makes for a snapshotted party.
  await sql`DELETE FROM card_trades WHERE group_id IS NULL`.execute(db);

  await sql`ALTER TABLE card_trades DROP CONSTRAINT card_trades_group_id_fkey`.execute(db);
  await sql`
    ALTER TABLE card_trades
    ADD CONSTRAINT card_trades_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES friend_groups (id) ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE card_trades
      DROP COLUMN group_name,
      ALTER COLUMN group_id SET NOT NULL
  `.execute(db);
}
