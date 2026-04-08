import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("printings")
    .dropConstraint("chk_printings_collector_number_positive")
    .execute();
  await db.schema.alterTable("printings").dropColumn("collector_number").execute();

  await db.schema
    .alterTable("candidate_printings")
    .dropConstraint("chk_candidate_printings_collector_number_positive")
    .execute();
  await db.schema.alterTable("candidate_printings").dropColumn("collector_number").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("printings")
    .addColumn("collector_number", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
  await db.schema
    .alterTable("printings")
    .addCheckConstraint("chk_printings_collector_number_positive", sql`collector_number > 0`)
    .execute();

  await db.schema
    .alterTable("candidate_printings")
    .addColumn("collector_number", "integer")
    .execute();
  await db.schema
    .alterTable("candidate_printings")
    .addCheckConstraint(
      "chk_candidate_printings_collector_number_positive",
      sql`collector_number > 0`,
    )
    .execute();
}
