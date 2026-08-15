import type { Kysely } from "kysely";
import { sql } from "kysely";

// Repairs every jsonb column that was written double-encoded, then makes the
// shape a database rule so it cannot happen again.
//
// The bug: postgres.js picks a parameter's serializer from the type Postgres
// describes for it, and for a jsonb parameter that serializer is JSON.stringify.
// Repository code that pre-serialized with JSON.stringify therefore handed it
// JSON *text*, which got encoded a second time and stored as a jsonb *string
// scalar* — `"{\"a\":1}"` where the column should hold `{"a": 1}`. It survived
// unnoticed for so long because every read ran a defensive JSON.parse that
// repaired the shape before any caller saw it, so the corruption was invisible
// from the application and visible only to SQL. Where SQL did have to look
// inside the blob, the workaround was written into the query instead
// (`(data #>> '{}')::jsonb` in the preferences recipient lookups, a
// `jsonb_typeof` CASE in the meta-candidate scan, and migration 164's backfill).
//
// The unwrap is `col #>> '{}'`, which extracts a jsonb value as text: for a
// string scalar that is the inner JSON text, which `::jsonb` then parses into
// the real structure. Only rows where `jsonb_typeof = 'string'` are touched, so
// re-running is a no-op and rows already stored correctly are left alone.
//
// `job_runs.result` gets an extra guard. Its type is `unknown` — a job could in
// principle have returned a genuine string, and unwrapping that would destroy
// it — so only values whose text starts with `{` or `[` are converted.
//
// Unwrapping is not the whole repair. A writer that passed an explicit `null`
// stringified it to the text `"null"`, so those rows unwrap to a jsonb *null*,
// which is not SQL NULL and satisfies no shape. `tournaments.allowed_sets` holds
// five of them. A nullable jsonb column means "absent" with SQL NULL, so every
// nullable one is normalized after the unwrap. This is legacy-only: passing the
// value directly, as the repositories now do, turns a JS `null` into SQL NULL
// and never into a jsonb null.
const DOUBLE_ENCODED: { table: string; column: string }[] = [
  { table: "admin_events", column: "old_values" },
  { table: "admin_events", column: "new_values" },
  { table: "copies", column: "links" },
  { table: "deck_check_entries", column: "change_summary" },
  { table: "deck_check_entries", column: "pre_edit_lines" },
  { table: "decks", column: "format_config" },
  { table: "decks", column: "links" },
  { table: "decks", column: "odds_config" },
  { table: "candidate_meta_decks", column: "cards" },
  { table: "candidate_meta_events", column: "extra_data" },
  { table: "overlay_channels", column: "payload" },
  { table: "pods", column: "penalty_breakdown" },
  { table: "tournaments", column: "allowed_sets" },
  { table: "user_preferences", column: "data" },
];

// The shape each column is allowed to hold once repaired. A column that can be
// either (only `job_runs.result`, whose payload differs per job kind) is left
// out of the constraint pass and keeps only the backfill.
const SHAPES: { table: string; column: string; shape: "object" | "array" }[] = [
  { table: "admin_events", column: "old_values", shape: "object" },
  { table: "admin_events", column: "new_values", shape: "object" },
  { table: "candidate_cards", column: "extra_data", shape: "object" },
  { table: "candidate_meta_decks", column: "cards", shape: "array" },
  { table: "candidate_meta_events", column: "extra_data", shape: "object" },
  { table: "candidate_printings", column: "extra_data", shape: "object" },
  { table: "card_submissions", column: "proposed_diff", shape: "array" },
  { table: "copies", column: "links", shape: "array" },
  { table: "deck_check_entries", column: "change_summary", shape: "object" },
  { table: "deck_check_entries", column: "pre_edit_lines", shape: "array" },
  { table: "decks", column: "format_config", shape: "object" },
  { table: "decks", column: "links", shape: "array" },
  { table: "decks", column: "odds_config", shape: "object" },
  { table: "lists", column: "rules", shape: "array" },
  { table: "overlay_channels", column: "payload", shape: "object" },
  { table: "pods", column: "penalty_breakdown", shape: "object" },
  { table: "tournaments", column: "allowed_sets", shape: "array" },
  { table: "user_preferences", column: "data", shape: "object" },
];

/** @returns The constraint name guarding one column's jsonb shape. */
function constraintName(table: string, column: string): string {
  return `chk_${table}_${column}_shape`;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const { table, column } of DOUBLE_ENCODED) {
    await sql`
      UPDATE ${sql.ref(table)}
      SET ${sql.ref(column)} = (${sql.ref(column)} #>> '{}')::jsonb
      WHERE jsonb_typeof(${sql.ref(column)}) = 'string'
    `.execute(db);
  }

  await sql`
    UPDATE job_runs
    SET result = (result #>> '{}')::jsonb
    WHERE jsonb_typeof(result) = 'string'
      AND (result #>> '{}') ~ '^\\s*[\\[{]'
  `.execute(db);

  // Collapse jsonb nulls into SQL NULL wherever the column allows it. Driven off
  // the catalog rather than a hand-written list, so a nullable jsonb column that
  // is empty today but acquires a stringified null before this ships is covered
  // too. A NOT NULL column cannot hold one of these (none do); if that ever
  // changed, the constraint below would refuse it loudly rather than silently.
  // Aliases are quoted because the Kysely instance carries CamelCasePlugin,
  // which would otherwise rewrite `table_name` to `tableName` on the way out.
  const nullable = await sql<{ tbl: string; col: string }>`
    SELECT c.table_name AS "tbl", c.column_name AS "col"
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.data_type = 'jsonb'
      AND c.is_nullable = 'YES'
  `.execute(db);

  for (const { tbl, col } of nullable.rows) {
    await sql`
      UPDATE ${sql.ref(tbl)}
      SET ${sql.ref(col)} = NULL
      WHERE jsonb_typeof(${sql.ref(col)}) = 'null'
    `.execute(db);
  }

  // The constraint is what keeps this fixed. The write-side types make a
  // stringified value a compile error, but a cast or a raw sql fragment can
  // still get past them, and this is the layer that cannot be bypassed.
  // NOT VALID skips the full-table scan on adoption; the rows were just
  // repaired above, and every later write is checked either way.
  for (const { table, column, shape } of SHAPES) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
      ADD CONSTRAINT ${sql.ref(constraintName(table, column))}
      CHECK (${sql.ref(column)} IS NULL OR jsonb_typeof(${sql.ref(column)}) = ${sql.lit(shape)})
      NOT VALID
    `.execute(db);
    await sql`
      ALTER TABLE ${sql.ref(table)} VALIDATE CONSTRAINT ${sql.ref(constraintName(table, column))}
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const { table, column } of SHAPES) {
    await sql`
      ALTER TABLE ${sql.ref(table)} DROP CONSTRAINT ${sql.ref(constraintName(table, column))}
    `.execute(db);
  }
  // The unwrapped values are not re-encoded: the double encoding was the bug,
  // and rolling this back to reintroduce it would only corrupt the data again.
  // Code that predates this migration reads either shape, so plain values are
  // safe on the way back down.
}
