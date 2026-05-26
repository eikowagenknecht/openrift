import type { Kysely } from "kysely";
import { sql } from "kysely";

// Renames `lists.intent` values to match the user-facing labels:
//   'buy'  → 'wish'   (Wishlist)
//   'sell' → 'trade'  (Tradelist)
//   'organize' is unchanged.
//
// Existing rows are updated in place. The check constraints are dropped
// before the UPDATE and re-added with the new value set afterwards so the
// migration is atomic in one transaction.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("lists").dropConstraint("chk_lists_intent_kind").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_intent").execute();

  await sql`UPDATE lists SET intent = 'wish' WHERE intent = 'buy'`.execute(db);
  await sql`UPDATE lists SET intent = 'trade' WHERE intent = 'sell'`.execute(db);

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_intent",
      sql`intent = ANY (ARRAY['wish'::text, 'trade'::text, 'organize'::text])`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_intent_kind",
      sql`
        (intent = 'wish'     AND kind IN ('card','printing')) OR
        (intent = 'trade'    AND kind = 'copy') OR
        (intent = 'organize' AND kind IN ('card','printing','copy'))
      `,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("lists").dropConstraint("chk_lists_intent_kind").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_intent").execute();

  await sql`UPDATE lists SET intent = 'buy' WHERE intent = 'wish'`.execute(db);
  await sql`UPDATE lists SET intent = 'sell' WHERE intent = 'trade'`.execute(db);

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_intent",
      sql`intent = ANY (ARRAY['buy'::text, 'sell'::text, 'organize'::text])`,
    )
    .execute();

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
}
