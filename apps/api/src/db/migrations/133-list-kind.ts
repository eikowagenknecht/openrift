import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds list-level granularity (kind: card | printing | copy) and replaces the
// per-entry three-way XOR with single-granularity entries whose kind matches
// the parent list. Sensible combos only:
//   intent='buy'      → kind ∈ ('card','printing')   — you don't buy a specific copy
//   intent='sell'     → kind = 'copy'                — selling specific physical cards
//   intent='organize' → kind ∈ ('card','printing','copy')
//
// The previous migration's data is cleared up front since the trade-list and
// wish-list features weren't in production and the per-entry granularity
// shape doesn't map cleanly to the new single-granularity-per-list model.
export async function up(db: Kysely<unknown>): Promise<void> {
  // Clear data first so the new constraints can be added without violations.
  await sql`DELETE FROM list_entries`.execute(db);
  await sql`DELETE FROM lists`.execute(db);

  // ── 1. Add `kind` to lists ───────────────────────────────────────────────
  await db.schema
    .alterTable("lists")
    .addColumn("kind", sql`text`, (col) => col.notNull())
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_kind",
      sql`kind = ANY (ARRAY['card'::text, 'printing'::text, 'copy'::text])`,
    )
    .execute();

  // Intent × kind matrix: the six allowed combos.
  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_intent_kind",
      sql`
        (intent = 'buy'      AND kind IN ('card','printing')) OR
        (intent = 'sell'     AND kind = 'copy') OR
        (intent = 'organize' AND kind IN ('card','printing','copy'))
      `,
    )
    .execute();

  // Composite UNIQUE so list_entries can FK to (list_id, kind) and enforce
  // every entry's kind matches its parent.
  await db.schema
    .alterTable("lists")
    .addUniqueConstraint("uq_lists_id_kind", ["id", "kind"])
    .execute();

  // ── 2. Replace list_entries XOR with single-granularity matching kind ────
  await db.schema
    .alterTable("list_entries")
    .addColumn("kind", sql`text`, (col) => col.notNull())
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_kind",
      sql`kind = ANY (ARRAY['card'::text, 'printing'::text, 'copy'::text])`,
    )
    .execute();

  // The old XOR no longer applies — drop it and add a stricter shape check
  // that ties each kind to exactly the matching nullable column.
  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_target_xor")
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_kind_shape",
      sql`
        (kind = 'card'     AND card_id     IS NOT NULL AND printing_id IS NULL AND copy_id IS NULL) OR
        (kind = 'printing' AND printing_id IS NOT NULL AND card_id     IS NULL AND copy_id IS NULL) OR
        (kind = 'copy'     AND copy_id     IS NOT NULL AND card_id     IS NULL AND printing_id IS NULL)
      `,
    )
    .execute();

  // Cross-table integrity: an entry's kind must match its parent list's kind.
  // The existing (list_id, user_id) FK from migration 132 already cascades
  // deletes, so this FK only needs to enforce the kind alignment.
  await db.schema
    .alterTable("list_entries")
    .addForeignKeyConstraint("fk_list_entries_list_kind", ["list_id", "kind"], "lists", [
      "id",
      "kind",
    ])
    .onDelete("cascade")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Clearing on the way down too — the old XOR has no `kind` to derive from
  // and per-entry-granularity ambiguity would re-emerge.
  await sql`DELETE FROM list_entries`.execute(db);
  await sql`DELETE FROM lists`.execute(db);

  await db.schema.alterTable("list_entries").dropConstraint("fk_list_entries_list_kind").execute();

  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_kind_shape")
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_target_xor",
      sql`((card_id IS NOT NULL)::int + (printing_id IS NOT NULL)::int + (copy_id IS NOT NULL)::int) = 1`,
    )
    .execute();

  await db.schema.alterTable("list_entries").dropConstraint("chk_list_entries_kind").execute();
  await db.schema.alterTable("list_entries").dropColumn("kind").execute();

  await db.schema.alterTable("lists").dropConstraint("uq_lists_id_kind").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_intent_kind").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_kind").execute();
  await db.schema.alterTable("lists").dropColumn("kind").execute();
}
