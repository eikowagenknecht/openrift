import type { Kysely } from "kysely";
import { sql } from "kysely";

// Durable outcome record for in-app card submissions (ADR-036).
//
// ADR-036 kept submissions inside the candidate pipeline and recorded the
// submitter on candidate_cards, expecting a status surface to be a pure
// addition later. Attribution survived; the outcome did not. Nothing links an
// accepted candidate to the card it produced, and ignoring only inserts a
// (provider, external_id) key into ignored_candidate_cards.
//
// Status can't live on candidate_cards either, because that table is staging
// and is meant to be disposable: deleteByProvider hard-deletes a provider's
// rows and the batch ingest deletes rows absent from a payload. A contributor's
// history has to outlive a staging cleanup, so it gets its own append-only
// table. candidate_card_id is ON DELETE SET NULL for exactly that reason — the
// ledger row survives the staging row.
//
// proposed_diff records which fields actually differed from the live card at
// submission time. Resolution compares those fields against the catalog rather
// than trying to attribute an admin's cell click to a column, which would mark
// a contributor rejected whenever the admin accepted the same value from
// another provider's column.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("card_submissions")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    // Mirrors the candidate's natural key so the ignore path can resolve a
    // submission from (provider, external_id) alone, which is all
    // ignored_candidate_cards carries.
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("candidate_card_id", "uuid")
    .addColumn("kind", "text", (col) => col.notNull())
    // Snapshots, so a resolved submission still reads as itself after the
    // staging row is gone.
    .addColumn("card_name", "text", (col) => col.notNull())
    .addColumn("card_slug", "text")
    .addColumn("note", "text")
    .addColumn("proposed_diff", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("resolution_reason", "text")
    .addColumn("resolution_note", "text")
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by_user_id", "text")
    .addColumn("accepted_card_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint(
      "chk_card_submissions_kind",
      sql`kind IN ('new_card', 'correction', 'image')`,
    )
    .addCheckConstraint(
      "chk_card_submissions_status",
      sql`status IN ('pending', 'accepted', 'already_correct', 'not_applied', 'rejected')`,
    )
    // A resolved row always carries its instant, a pending row never does.
    // Without this the contributor page can render "Applied" with no date.
    .addCheckConstraint(
      "chk_card_submissions_resolved_at",
      sql`(status = 'pending') = (resolved_at IS NULL)`,
    )
    .addCheckConstraint(
      "chk_card_submissions_reason",
      sql`resolution_reason IS NULL OR resolution_reason IN ('duplicate', 'already_correct', 'unverified', 'not_a_card', 'bad_image')`,
    )
    .addCheckConstraint("chk_card_submissions_card_name_not_empty", sql`card_name <> ''`)
    .addCheckConstraint("chk_card_submissions_card_slug_not_empty", sql`card_slug <> ''`)
    .addCheckConstraint("chk_card_submissions_note_not_empty", sql`note <> ''`)
    .addCheckConstraint(
      "chk_card_submissions_resolution_note_not_empty",
      sql`resolution_note <> ''`,
    )
    .addCheckConstraint("chk_card_submissions_provider_not_empty", sql`provider <> ''`)
    .addCheckConstraint("chk_card_submissions_external_id_not_empty", sql`external_id <> ''`)
    .execute();

  // Deleting an account takes its contribution history with it: there is nobody
  // left to show a status to or award an achievement for.
  await db.schema
    .alterTable("card_submissions")
    .addForeignKeyConstraint("card_submissions_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_submissions")
    .addForeignKeyConstraint(
      "card_submissions_candidate_card_id_fkey",
      ["candidate_card_id"],
      "candidate_cards",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("card_submissions")
    .addForeignKeyConstraint(
      "card_submissions_resolved_by_user_id_fkey",
      ["resolved_by_user_id"],
      "users",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("card_submissions")
    .addForeignKeyConstraint(
      "card_submissions_accepted_card_id_fkey",
      ["accepted_card_id"],
      "cards",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  // One ledger row per submission. The candidate's external_id is minted per
  // submission (ADR-036), so this is also what makes the ignore path's
  // (provider, external_id) lookup exact.
  await db.schema
    .createIndex("uq_card_submissions_provider_external")
    .on("card_submissions")
    .columns(["provider", "external_id"])
    .unique()
    .execute();

  // The contributor's own page, newest first.
  await sql`
    CREATE INDEX idx_card_submissions_user_created
      ON card_submissions (user_id, created_at DESC)
  `.execute(db);

  // Backs both the per-user daily cap and a later contributor achievement
  // ("how many of mine were accepted").
  await db.schema
    .createIndex("idx_card_submissions_user_status")
    .on("card_submissions")
    .columns(["user_id", "status"])
    .execute();

  await sql`
    CREATE INDEX idx_card_submissions_candidate_card_id
      ON card_submissions (candidate_card_id)
      WHERE candidate_card_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON card_submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── Backfill ─────────────────────────────────────────────────────────────
  // One row per existing user submission still in staging. Rows whose submitter
  // was deleted (submitted_by_user_id nulled by that FK) are skipped: the
  // ledger is per-contributor and there is no contributor left.
  //
  // These rows must be given a final status here, not left pending. Resolution
  // only fires when an admin checks or ignores a candidate, and every historical
  // submission was reviewed long before this table existed, so nothing will ever
  // re-trigger them. Left pending they would read "Waiting for review" forever.
  //
  // The ladder, in the order the CASE tests it:
  //   ignored key                -> rejected, at the instant it was ignored
  //   the card exists now        -> accepted, crediting the contributor
  //   checked, but still no card -> not_applied, the admin looked and passed
  //   otherwise                  -> pending, genuinely still in the queue
  //
  // "The card exists" is the same two-step lookup the runtime uses
  // (`resolveCardIdByName`): cards.norm_name first, then card_name_aliases.
  //
  // proposed_diff stays empty because the live values at submission time are
  // gone. That is harmless here precisely because these rows are not pending:
  // an empty diff only decides an outcome for a row that still has to resolve.
  await sql`
    INSERT INTO card_submissions (
      user_id, provider, external_id, candidate_card_id, kind,
      card_name, card_slug, note, status, resolved_at, accepted_card_id,
      created_at, updated_at
    )
    SELECT
      cc.submitted_by_user_id,
      cc.provider,
      cc.external_id,
      cc.id,
      CASE
        WHEN EXISTS (SELECT 1 FROM candidate_printings cp WHERE cp.candidate_card_id = cc.id)
          AND NOT EXISTS (
            SELECT 1 FROM candidate_printings cp
            WHERE cp.candidate_card_id = cc.id
              AND (cp.image_url IS NULL OR cp.printing_id IS NULL)
          )
          THEN 'image'
        WHEN COALESCE(c_direct.id, c_alias.id) IS NOT NULL THEN 'correction'
        ELSE 'new_card'
      END,
      cc.name,
      COALESCE(c_direct.slug, c_alias.slug),
      cc.submission_note,
      CASE
        WHEN ic.external_id IS NOT NULL THEN 'rejected'
        WHEN COALESCE(c_direct.id, c_alias.id) IS NOT NULL THEN 'accepted'
        WHEN cc.checked_at IS NOT NULL THEN 'not_applied'
        ELSE 'pending'
      END,
      -- A CHECK ties this to the status: set for every non-pending row, null
      -- for pending. Best available instant in each case.
      CASE
        WHEN ic.external_id IS NOT NULL THEN ic.created_at
        WHEN COALESCE(c_direct.id, c_alias.id) IS NOT NULL
          THEN COALESCE(cc.checked_at, cc.updated_at)
        WHEN cc.checked_at IS NOT NULL THEN cc.checked_at
      END,
      CASE
        WHEN ic.external_id IS NULL THEN COALESCE(c_direct.id, c_alias.id)
      END,
      cc.created_at,
      cc.updated_at
    FROM candidate_cards cc
    LEFT JOIN cards c_direct ON c_direct.norm_name = cc.norm_name
    LEFT JOIN card_name_aliases cna ON cna.norm_name = cc.norm_name
    LEFT JOIN cards c_alias ON c_alias.id = cna.card_id
    LEFT JOIN ignored_candidate_cards ic
      ON ic.provider = cc.provider AND ic.external_id = cc.external_id
    WHERE cc.provider = 'usersubmission'
      AND cc.submitted_by_user_id IS NOT NULL
    ON CONFLICT (provider, external_id) DO NOTHING
  `.execute(db);
}

/**
 * @returns Resolves once the submission ledger is removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("card_submissions").execute();
}
