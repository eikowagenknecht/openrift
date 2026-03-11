import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Clean up rows with NULL group_id (caused by unmap bug) ─────────────────
  // DML (DELETE) is not expressible in the schema builder
  await sql`
    DELETE FROM tcgplayer_snapshots
    WHERE source_id IN (SELECT id FROM tcgplayer_sources WHERE group_id IS NULL)
  `.execute(db);
  await sql`DELETE FROM tcgplayer_sources WHERE group_id IS NULL`.execute(db);
  await sql`DELETE FROM tcgplayer_staging WHERE group_id IS NULL`.execute(db);

  await sql`
    DELETE FROM cardmarket_snapshots
    WHERE source_id IN (SELECT id FROM cardmarket_sources WHERE group_id IS NULL)
  `.execute(db);
  await sql`DELETE FROM cardmarket_sources WHERE group_id IS NULL`.execute(db);
  await sql`DELETE FROM cardmarket_staging WHERE group_id IS NULL`.execute(db);

  // ── Clean up rows with NULL product_name (same unmap bug) ──────────────────
  // DML (DELETE) is not expressible in the schema builder
  await sql`
    DELETE FROM tcgplayer_snapshots
    WHERE source_id IN (SELECT id FROM tcgplayer_sources WHERE product_name IS NULL)
  `.execute(db);
  await sql`DELETE FROM tcgplayer_sources WHERE product_name IS NULL`.execute(db);

  await sql`
    DELETE FROM cardmarket_snapshots
    WHERE source_id IN (SELECT id FROM cardmarket_sources WHERE product_name IS NULL)
  `.execute(db);
  await sql`DELETE FROM cardmarket_sources WHERE product_name IS NULL`.execute(db);

  // ── Drop unused url column (URLs are derived from external_id) ─────────────
  await db.schema.alterTable("tcgplayer_sources").dropColumn("url").execute();
  await db.schema.alterTable("cardmarket_sources").dropColumn("url").execute();

  // ── Add NOT NULL constraints ───────────────────────────────────────────────
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("group_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("external_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("product_name", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .alterColumn("group_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .alterColumn("external_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("group_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("external_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("product_name", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_staging")
    .alterColumn("group_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_staging")
    .alterColumn("external_id", (col) => col.setNotNull())
    .execute();

  // ── Add foreign keys ──────────────────────────────────────────────────────
  await db.schema
    .alterTable("tcgplayer_sources")
    .addForeignKeyConstraint("fk_tcgplayer_sources_group", ["group_id"], "tcgplayer_groups", [
      "group_id",
    ])
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .addForeignKeyConstraint("fk_tcgplayer_staging_group", ["group_id"], "tcgplayer_groups", [
      "group_id",
    ])
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .addForeignKeyConstraint(
      "fk_cardmarket_sources_expansion",
      ["group_id"],
      "cardmarket_expansions",
      ["expansion_id"],
    )
    .execute();
  await db.schema
    .alterTable("cardmarket_staging")
    .addForeignKeyConstraint(
      "fk_cardmarket_staging_expansion",
      ["group_id"],
      "cardmarket_expansions",
      ["expansion_id"],
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("cardmarket_staging")
    .dropConstraint("fk_cardmarket_staging_expansion")
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .dropConstraint("fk_cardmarket_sources_expansion")
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .dropConstraint("fk_tcgplayer_staging_group")
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .dropConstraint("fk_tcgplayer_sources_group")
    .execute();

  await db.schema.alterTable("tcgplayer_sources").addColumn("url", "text").execute();
  await db.schema.alterTable("cardmarket_sources").addColumn("url", "text").execute();

  await db.schema
    .alterTable("cardmarket_staging")
    .alterColumn("external_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_staging")
    .alterColumn("group_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("product_name", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("external_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("cardmarket_sources")
    .alterColumn("group_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .alterColumn("external_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_staging")
    .alterColumn("group_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("product_name", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("external_id", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("tcgplayer_sources")
    .alterColumn("group_id", (col) => col.dropNotNull())
    .execute();
}
