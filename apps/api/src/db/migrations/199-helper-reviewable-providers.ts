import type { Kysely } from "kysely";

// card-review admin grant (ADR-040 lineage): which providers a card-review
// grant holder may review candidates from. Defaults false so new providers
// are never helper-reviewable until explicitly allowed.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("provider_settings")
    .addColumn("helper_reviewable", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("provider_settings").dropColumn("helper_reviewable").execute();
}
