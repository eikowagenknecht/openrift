import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Languages lookup table ────────────────────────────────────────────────
  await db.schema
    .createTable("languages")
    .addColumn("code", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("languages_code_not_empty", sql`code <> ''`)
    .addCheckConstraint("languages_name_not_empty", sql`name <> ''`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON languages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await db
    .insertInto("languages" as never)
    .values([
      { code: "EN", name: "English", sort_order: 1 } as never,
      { code: "FR", name: "French", sort_order: 2 } as never,
      { code: "ZH", name: "Chinese", sort_order: 3 } as never,
    ])
    .execute();

  // ── Add language to printings ─────────────────────────────────────────────
  await db.schema
    .alterTable("printings")
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .execute();

  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_language_fk", ["language"], "languages", ["code"])
    .execute();

  // ── Add printed_name to printings ─────────────────────────────────────────
  await db.schema.alterTable("printings").addColumn("printed_name", "text").execute();

  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT chk_printings_no_empty_printed_name CHECK (printed_name <> '')
  `.execute(db);

  // ── Update composite unique constraint to include language ────────────────
  await sql`
    ALTER TABLE printings
    DROP CONSTRAINT IF EXISTS printings_card_id_short_code_finish_promo_type_id_key
  `.execute(db);

  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT printings_card_id_short_code_finish_promo_type_id_language_key
    UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, promo_type_id, language)
  `.execute(db);

  // ── Add language + printed_name to candidate_printings ────────────────────
  await db.schema.alterTable("candidate_printings").addColumn("language", "text").execute();

  await sql`
    ALTER TABLE candidate_printings
    ADD CONSTRAINT chk_candidate_printings_no_empty_language CHECK (language <> '')
  `.execute(db);

  await db.schema.alterTable("candidate_printings").addColumn("printed_name", "text").execute();

  await sql`
    ALTER TABLE candidate_printings
    ADD CONSTRAINT chk_candidate_printings_no_empty_printed_name CHECK (printed_name <> '')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE candidate_printings DROP CONSTRAINT IF EXISTS chk_candidate_printings_no_empty_printed_name`.execute(
    db,
  );
  await db.schema.alterTable("candidate_printings").dropColumn("printed_name").execute();
  await sql`ALTER TABLE candidate_printings DROP CONSTRAINT IF EXISTS chk_candidate_printings_no_empty_language`.execute(
    db,
  );
  await db.schema.alterTable("candidate_printings").dropColumn("language").execute();

  await sql`
    ALTER TABLE printings
    DROP CONSTRAINT IF EXISTS printings_card_id_short_code_finish_promo_type_id_language_key
  `.execute(db);
  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT printings_card_id_short_code_finish_promo_type_id_key
    UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, promo_type_id)
  `.execute(db);

  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_no_empty_printed_name`.execute(
    db,
  );
  await db.schema.alterTable("printings").dropColumn("printed_name").execute();
  await db.schema.alterTable("printings").dropColumn("language").execute();

  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON languages`.execute(db);
  await db.schema.dropTable("languages").execute();
}
