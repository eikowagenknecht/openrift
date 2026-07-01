import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-034: dynamic list rules. A JSONB array of rules on `lists`; each rule
// holds a saved CardFilters predicate plus mode math (target quantity /
// keep-threshold / exclusions). Wish lists may carry several rules; trade lists
// are capped at one by the route layer. Rules are evaluated lazily at read time
// and never materialized. Empty array = no rules.
//
// Shape validation is app-level (Zod `listRulesSchema`); the DB only gates which
// intents may carry rules — wish and trade, never organize.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("lists")
    .addColumn("rules", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .execute();
  await sql`
    ALTER TABLE lists
      ADD CONSTRAINT chk_lists_rules_intent
      CHECK ((jsonb_array_length(rules) = 0) OR (intent IN ('wish', 'trade')))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE lists DROP CONSTRAINT chk_lists_rules_intent`.execute(db);
  await db.schema.alterTable("lists").dropColumn("rules").execute();
}
