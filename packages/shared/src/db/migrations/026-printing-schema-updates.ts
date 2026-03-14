import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Printing schema updates:
 * - Replace unique constraint to include rarity (alongside is_promo)
 * - Rewrite slugs from 5-segment to 4-segment: "sourceId:rarity:finish:promo|"
 * - Null out rehosted image URLs so they get re-rehosted with new filenames
 * - Add comment column to printings
 * - Make printed_effect_text / flavor_text nullable (empty strings → NULL)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Slug / rarity constraint ────────────────────────────────────────────────

  await db.schema
    .alterTable("printings")
    .dropConstraint("uq_printings_variant")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "source_id",
      "art_variant",
      "is_signed",
      "is_promo",
      "rarity",
      "finish",
    ])
    .execute();

  await sql`
    UPDATE printings
    SET slug = source_id || ':' || lower(rarity) || ':' || finish || ':' ||
      CASE WHEN is_promo THEN 'promo' ELSE '' END,
        updated_at = now()
  `.execute(db);

  await sql`
    UPDATE printing_images SET rehosted_url = NULL, updated_at = now()
    WHERE rehosted_url IS NOT NULL
  `.execute(db);

  // ── Comment column + nullable text fields ───────────────────────────────────

  await db.schema.alterTable("printings").addColumn("comment", "text").execute();

  for (const table of ["printings", "printing_sources"] as const) {
    await db.schema
      .alterTable(table)
      .alterColumn("printed_effect_text", (col) => col.dropNotNull())
      .execute();
    await db.schema
      .alterTable(table)
      .alterColumn("flavor_text", (col) => col.dropNotNull())
      .execute();
    await sql`UPDATE ${sql.table(table)} SET printed_effect_text = NULL WHERE printed_effect_text = ''`.execute(
      db,
    );
    await sql`UPDATE ${sql.table(table)} SET flavor_text = NULL WHERE flavor_text = ''`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Undo comment column + nullable text fields ──────────────────────────────

  for (const table of ["printings", "printing_sources"] as const) {
    await sql`UPDATE ${sql.table(table)} SET printed_effect_text = '' WHERE printed_effect_text IS NULL`.execute(
      db,
    );
    await sql`UPDATE ${sql.table(table)} SET flavor_text = '' WHERE flavor_text IS NULL`.execute(
      db,
    );
    await db.schema
      .alterTable(table)
      .alterColumn("printed_effect_text", (col) => col.setNotNull())
      .execute();
    await db.schema
      .alterTable(table)
      .alterColumn("flavor_text", (col) => col.setNotNull())
      .execute();
  }

  await db.schema.alterTable("printings").dropColumn("comment").execute();

  // ── Undo slug / rarity constraint ───────────────────────────────────────────

  await db.schema
    .alterTable("printings")
    .dropConstraint("uq_printings_variant")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "source_id",
      "art_variant",
      "is_signed",
      "is_promo",
      "finish",
    ])
    .execute();

  await sql`
    UPDATE printings
    SET slug = source_id || ':' || art_variant || ':' ||
      CASE WHEN is_signed THEN 'signed' ELSE '' END || ':' ||
      CASE WHEN is_promo THEN 'promo' ELSE '' END || ':' || finish,
      updated_at = now()
  `.execute(db);
}
