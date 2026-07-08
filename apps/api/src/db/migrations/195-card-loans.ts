import type { Kysely } from "kysely";
import { sql } from "kysely";

// Card lending ledger (ADR-039).
//
// Two tables, mirroring the card_trades / card_trade_copies split (ADR-019).
// `loans` is the lender's record that `quantity` copies of one printing are
// with one borrower — either a friend-group co-member (borrower_user_id) or a
// free-text name (borrower_name). Loans are personal records: there is no
// group_id, and the record survives either party leaving a shared group.
//
// `loan_copies` pins the concrete copies currently out. Copies never move —
// the pin is a status overlay on the copy's home collection. Rows exist iff
// the copy is currently lent, so deck-availability and match-query exclusions
// need no status join. UNIQUE(copy_id) guarantees a copy is pinned by at most
// one live loan; cross-table exclusivity against card_trade_copies is enforced
// in the services (each claim path checks the other table in-transaction).
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. loans ───────────────────────────────────────────────────────────────
  await db.schema
    .createTable("loans")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("lender_user_id", "text", (col) => col.notNull())
    // Exactly one of borrower_user_id / borrower_name is set at creation.
    // Both-null is reachable only via SET NULL when a member borrower deletes
    // their account: the lender's ledger entry survives as "former member".
    .addColumn("borrower_user_id", "text")
    .addColumn("borrower_name", "text")
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    // Denormalised from the printing, for grouping/display (as in card_trades).
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.notNull())
    .addColumn("returned_quantity", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    // Member-borrower consent state, orthogonal to status. Unconfirmed loans
    // (both NULL) show on the borrower's side but affect nothing.
    .addColumn("acknowledged_at", "timestamptz")
    .addColumn("rejected_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    // returned / written_off
    .addColumn("closed_at", "timestamptz")
    .addCheckConstraint("chk_loans_status", sql`status IN ('active', 'returned', 'written_off')`)
    .addCheckConstraint("chk_loans_quantity", sql`quantity > 0`)
    .addCheckConstraint(
      "chk_loans_returned_bounds",
      sql`returned_quantity >= 0 AND returned_quantity <= quantity`,
    )
    // A loan only closes as returned when everything is back.
    .addCheckConstraint(
      "chk_loans_returned_complete",
      sql`status <> 'returned' OR returned_quantity = quantity`,
    )
    .addCheckConstraint("chk_loans_closed_shape", sql`(status = 'active') = (closed_at IS NULL)`)
    // At most one borrower identity; app enforces exactly-one at creation.
    .addCheckConstraint(
      "chk_loans_borrower_shape",
      sql`NOT (borrower_user_id IS NOT NULL AND borrower_name IS NOT NULL)`,
    )
    .addCheckConstraint(
      "chk_loans_borrower_name_not_empty",
      sql`borrower_name IS NULL OR borrower_name <> ''`,
    )
    .addCheckConstraint(
      "chk_loans_distinct_parties",
      sql`borrower_user_id IS NULL OR borrower_user_id <> lender_user_id`,
    )
    // Rejecting clears any earlier acknowledgment (and vice versa).
    .addCheckConstraint(
      "chk_loans_ack_reject",
      sql`NOT (acknowledged_at IS NOT NULL AND rejected_at IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .alterTable("loans")
    .addForeignKeyConstraint("loans_lender_user_id_fkey", ["lender_user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // SET NULL, not CASCADE: the lender's card is still physically out when the
  // borrower deletes their account, so the ledger entry must survive.
  await db.schema
    .alterTable("loans")
    .addForeignKeyConstraint("loans_borrower_user_id_fkey", ["borrower_user_id"], "users", ["id"])
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("loans")
    .addForeignKeyConstraint("loans_printing_id_fkey", ["printing_id"], "printings", ["id"])
    .execute();

  await db.schema
    .alterTable("loans")
    .addForeignKeyConstraint("loans_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .createIndex("idx_loans_lender")
    .on("loans")
    .columns(["lender_user_id", "status"])
    .execute();

  await db.schema
    .createIndex("idx_loans_borrower")
    .on("loans")
    .columns(["borrower_user_id", "status"])
    .execute();

  // NOTE: deliberately NOT attaching the shared set_updated_at trigger, same
  // as card_trades. The repository sets updated_at = now() explicitly on real
  // transitions (return / write-off / acknowledge / reject) to drive
  // newest-first ordering.

  // ── 2. loan_copies ─────────────────────────────────────────────────────────
  // The set of copies *currently* out on a live loan. Rows are deleted as
  // copies are returned (or released on write-off / delete), so exclusion
  // checks are a bare existence test with no status join.
  await db.schema
    .createTable("loan_copies")
    .addColumn("loan_id", "uuid", (col) => col.notNull())
    .addColumn("copy_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("loan_copies_pkey", ["loan_id", "copy_id"])
    // A copy is out on at most one live loan.
    .addUniqueConstraint("uq_loan_copies_copy", ["copy_id"])
    .execute();

  await db.schema
    .alterTable("loan_copies")
    .addForeignKeyConstraint("loan_copies_loan_id_fkey", ["loan_id"], "loans", ["id"])
    .onDelete("cascade")
    .execute();

  // ON DELETE CASCADE is a backstop for account deletion (users → copies →
  // loan_copies). Write-off releases pins explicitly before disposing.
  await db.schema
    .alterTable("loan_copies")
    .addForeignKeyConstraint("loan_copies_copy_id_fkey", ["copy_id"], "copies", ["id"])
    .onDelete("cascade")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("loan_copies").execute();
  await db.schema.dropTable("loans").execute();
}
