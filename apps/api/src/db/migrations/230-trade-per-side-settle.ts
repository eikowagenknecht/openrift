import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Per-side trade settling (ADR-019, amendment 2026-08-10).
 *
 * "Mark as traded" is gone. Each party settles its own half of a reserved swap,
 * and the second settle promotes the row to `completed`. Two consequences land
 * in the schema:
 *
 * 1. `uq_card_trades_live` reserved the (group, giver, receiver, printing) slot
 *    for the whole of `pending` + `reserved`. A half-settled trade would now
 *    hold that slot until the slow side acted, blocking those two members from
 *    trading the same printing again. The predicate gains "and neither side has
 *    settled". Allowing the second trade is safe because `assertSupplyAvailable`
 *    allocates by copy id and already excludes pinned copies.
 *
 * 2. `completed` now means both sides settled. Rows that reached it under the
 *    old unilateral "mark as traded" have not, so they roll back to `reserved`
 *    with `completed_at` cleared, keeping whichever settle timestamp is already
 *    set (a one-sided row is exactly the legal half-settled state now). A trade
 *    completed prematurely comes back with its pins intact and both sides
 *    prompted, which is the recovery the old model could not offer.
 *
 * The rollback skips any row whose live slot a newer trade already holds. The
 * old predicate freed the slot on completion, so a second trade could legally
 * have been opened in the meantime, and reviving the first would collide.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop first: the rollback below revives rows that the old predicate would
  // have admitted to the index, and the new predicate is what makes them legal.
  await sql`DROP INDEX uq_card_trades_live`.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_card_trades_live
      ON card_trades (group_id, giver_user_id, receiver_user_id, printing_id)
      WHERE status = 'pending'
         OR (status = 'reserved'
             AND giver_sync_applied_at IS NULL
             AND receiver_sync_applied_at IS NULL)
  `.execute(db);

  await sql`
    UPDATE card_trades t
    SET status = 'reserved',
        completed_at = NULL,
        updated_at = now()
    WHERE t.status = 'completed'
      AND (t.giver_sync_applied_at IS NULL OR t.receiver_sync_applied_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM card_trades other
        WHERE other.id <> t.id
          AND other.group_id = t.group_id
          AND other.giver_user_id = t.giver_user_id
          AND other.receiver_user_id = t.receiver_user_id
          AND other.printing_id = t.printing_id
          AND (
            other.status = 'pending'
            OR (other.status = 'reserved'
                AND other.giver_sync_applied_at IS NULL
                AND other.receiver_sync_applied_at IS NULL)
          )
      )
  `.execute(db);
}

/**
 * Rows revived by `up` are not driven back to `completed`: which of them had
 * been completed before is no longer recorded once `completed_at` is cleared,
 * and a reserved trade is the safe reading either way. Restoring the old index
 * is enough to make the previous code correct again.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX uq_card_trades_live`.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_card_trades_live
      ON card_trades (group_id, giver_user_id, receiver_user_id, printing_id)
      WHERE status IN ('pending', 'reserved')
  `.execute(db);
}
