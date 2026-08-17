import type { Kysely } from "kysely";
import { sql } from "kysely";

// Two state machines whose status column and timestamp columns had to agree by
// convention only. Each CHECK below states a coupling that every writer already
// honours, verified against production-shaped data before adoption.
//
// card_trades (apps/api/src/repositories/card-trades.ts):
//   - `completed` is written by exactly one function, which stamps `completed_at`
//     in the same UPDATE, and the status is terminal, so the biconditional holds
//     in both directions.
//   - The three closed statuses are likewise terminal and all five writers stamp
//     `closed_at` in the same UPDATE. Nothing sets `closed_at` for any other
//     status, so this is also a biconditional. Note that a `cancelled` row may
//     legitimately carry `accepted_at` as well — cancelling a reserved trade does
//     not clear it — so the two are not exclusive.
//   - `reserved` always has an `accepted_at`. Only the forward direction is a
//     rule: `accepted_at` survives into `completed` and into a cancellation.
//
// Deliberately not encoded: `expires_at IS NOT NULL` currently coincides exactly
// with `status = 'pending'`, but that is the current expiry *policy* rather than
// a definitional property of the row, and giving reserved trades a deadline is a
// plausible change that should not have to drop a constraint.
//
// deck_check_entries (apps/api/src/services/deck-check-states.ts):
//   - `withdrawn` stamps `withdrawn_at`, and the one transition out of it
//     (restore to `submitted`) clears it. The reverse direction is included on
//     purpose: it is held today only by the transition guard refusing to move a
//     withdrawn entry anywhere but `submitted`, so a future path that moved one
//     to `editable` would silently leave a stale `withdrawn_at`. As a CHECK it
//     fails loudly instead.
//   - `approved` and `checked` each stamp their reviewer and timestamp together
//     and clear both on the way out. Forward only: `approved_at` deliberately
//     survives a `checked` → `submitted` re-open, so a `submitted` row may still
//     carry it.
//   - Not encoded: `state = 'submitted'` does not imply `submitted_at IS NOT
//     NULL` — a judge-created manual entry lands on the column default with no
//     submission time.
const CHECKS: { table: string; name: string; expression: string }[] = [
  {
    table: "card_trades",
    name: "chk_card_trades_completed_shape",
    expression: "(status = 'completed') = (completed_at IS NOT NULL)",
  },
  {
    table: "card_trades",
    name: "chk_card_trades_closed_shape",
    expression: "(status IN ('declined', 'cancelled', 'expired')) = (closed_at IS NOT NULL)",
  },
  {
    table: "card_trades",
    name: "chk_card_trades_reserved_accepted",
    expression: "status <> 'reserved' OR accepted_at IS NOT NULL",
  },
  {
    table: "deck_check_entries",
    name: "chk_deck_check_entries_withdrawn_shape",
    expression: "(state = 'withdrawn') = (withdrawn_at IS NOT NULL)",
  },
  {
    table: "deck_check_entries",
    name: "chk_deck_check_entries_approved_shape",
    expression: "state <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
  },
  {
    table: "deck_check_entries",
    name: "chk_deck_check_entries_checked_shape",
    expression: "state <> 'checked' OR (checked_at IS NOT NULL AND checked_by IS NOT NULL)",
  },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const check of CHECKS) {
    await sql`
      ALTER TABLE ${sql.ref(check.table)}
      ADD CONSTRAINT ${sql.ref(check.name)} CHECK (${sql.raw(check.expression)})
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const check of CHECKS) {
    await sql`
      ALTER TABLE ${sql.ref(check.table)} DROP CONSTRAINT ${sql.ref(check.name)}
    `.execute(db);
  }
}
