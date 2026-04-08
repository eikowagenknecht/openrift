import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("keyword_translations")
    .addColumn("keyword_name", "text", (col) =>
      col.notNull().references("keyword_styles.name").onUpdate("cascade").onDelete("cascade"),
    )
    .addColumn("language", "text", (col) =>
      col.notNull().references("languages.code").onUpdate("cascade").onDelete("cascade"),
    )
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("uq_keyword_translations_keyword_language", ["keyword_name", "language"])
    .addCheckConstraint("chk_keyword_translations_label_not_empty", sql`label <> ''`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON keyword_translations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("keyword_translations").execute();
}
