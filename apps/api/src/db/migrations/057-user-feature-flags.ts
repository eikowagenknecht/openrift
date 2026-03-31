import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_feature_flags")
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("flag_key", "text", (col) =>
      col.notNull().references("feature_flags.key").onDelete("cascade"),
    )
    .addColumn("enabled", "boolean", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_feature_flags_pk", ["user_id", "flag_key"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("user_feature_flags").execute();
}
