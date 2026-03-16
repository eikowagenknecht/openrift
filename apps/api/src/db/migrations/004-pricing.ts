import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── TCGPlayer ─────────────────────────────────────────────────────────────

  await db.schema
    .createTable("tcgplayer_groups")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("group_id", "integer", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("abbreviation", "text", (col) => col.notNull())
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("tcgplayer_sources")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("printing_id", "text", (col) => col.notNull().references("printings.id").unique())
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text")
    .addColumn("url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("tcgplayer_snapshots")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) => col.notNull().references("tcgplayer_sources.id"))
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addUniqueConstraint("tcgplayer_snapshots_source_id_recorded_at_key", [
      "source_id",
      "recorded_at",
    ])
    .execute();

  await db.schema
    .createTable("tcgplayer_staging")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("tcgplayer_staging_external_id_finish_recorded_at_key", [
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  // ── Cardmarket ────────────────────────────────────────────────────────────

  await db.schema
    .createTable("cardmarket_expansions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("expansion_id", "integer", (col) => col.notNull().unique())
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("cardmarket_sources")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("printing_id", "text", (col) => col.notNull().references("printings.id").unique())
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text")
    .addColumn("url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("cardmarket_snapshots")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) => col.notNull().references("cardmarket_sources.id"))
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addUniqueConstraint("cardmarket_snapshots_source_id_recorded_at_key", [
      "source_id",
      "recorded_at",
    ])
    .execute();

  await db.schema
    .createTable("cardmarket_staging")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("set_id", "text", (col) => col.references("sets.id"))
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("cardmarket_staging_external_id_finish_recorded_at_key", [
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  // ── Indexes ───────────────────────────────────────────────────────────────

  await db.schema
    .createIndex("idx_tcgplayer_sources_printing_id")
    .on("tcgplayer_sources")
    .column("printing_id")
    .execute();
  await db.schema
    .createIndex("idx_tcgplayer_snapshots_source_id")
    .on("tcgplayer_snapshots")
    .column("source_id")
    .execute();
  await db.schema
    .createIndex("idx_tcgplayer_snapshots_recorded_at")
    .on("tcgplayer_snapshots")
    .column("recorded_at")
    .execute();
  await db.schema
    .createIndex("idx_tcgplayer_staging_set_id")
    .on("tcgplayer_staging")
    .column("set_id")
    .execute();

  await db.schema
    .createIndex("idx_cardmarket_sources_printing_id")
    .on("cardmarket_sources")
    .column("printing_id")
    .execute();
  await db.schema
    .createIndex("idx_cardmarket_snapshots_source_id")
    .on("cardmarket_snapshots")
    .column("source_id")
    .execute();
  await db.schema
    .createIndex("idx_cardmarket_snapshots_recorded_at")
    .on("cardmarket_snapshots")
    .column("recorded_at")
    .execute();
  await db.schema
    .createIndex("idx_cardmarket_staging_set_id")
    .on("cardmarket_staging")
    .column("set_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("cardmarket_staging").execute();
  await db.schema.dropTable("cardmarket_snapshots").execute();
  await db.schema.dropTable("cardmarket_sources").execute();
  await db.schema.dropTable("cardmarket_expansions").execute();
  await db.schema.dropTable("tcgplayer_staging").execute();
  await db.schema.dropTable("tcgplayer_snapshots").execute();
  await db.schema.dropTable("tcgplayer_sources").execute();
  await db.schema.dropTable("tcgplayer_groups").execute();
}
