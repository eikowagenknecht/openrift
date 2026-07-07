import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-034 amendment 2: multiple rules per list, combined per a per-list mode.
// `rule_combine` names how overlapping rule outputs reconcile. NULL means the
// intent's default (wish: 'sum', trade: 'protect'), so existing lists follow
// the new defaults without a backfill. Wish modes: sum | max. Trade modes:
// protect | count-sum | count-max. Intent-matching is validated app-level
// (Zod + route guard); the CHECK only bounds the vocabulary.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("lists")
    .addColumn("rule_combine", "text", (col) =>
      col.check(sql`rule_combine IN ('sum', 'max', 'protect', 'count-sum', 'count-max')`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("lists").dropColumn("rule_combine").execute();
}
