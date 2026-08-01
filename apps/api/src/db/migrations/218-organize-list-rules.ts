import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-034 amendment 4: organize lists may carry dynamic rules too. Migration 182
// gated the `rules` column to wish/trade intents, on the assumption that a rule
// is either demand ("I want these") or supply ("I'll trade these"). It is really
// neither: a rule's shape follows the list's *kind* — card/printing lists take
// the demand shape, copy lists the supply shape — and organize lists span all
// three kinds, so every one of them already has a well-defined rule shape.
// Dropping the constraint leaves shape validation where it belongs, in the
// app-level Zod (`listRulesSchema` + the kind refinements on the list routes).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE lists DROP CONSTRAINT chk_lists_rules_intent`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Organize lists written after the up() migration would violate the restored
  // constraint, so clear their rules first — the column defaults to an empty
  // array and a rule-less organize list is exactly what existed before.
  await sql`UPDATE lists SET rules = '[]'::jsonb WHERE intent = 'organize'`.execute(db);
  await sql`
    ALTER TABLE lists
      ADD CONSTRAINT chk_lists_rules_intent
      CHECK ((jsonb_array_length(rules) = 0) OR (intent IN ('wish', 'trade')))
  `.execute(db);
}
