import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Sets ──────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("sets")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("total_cards", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── Cards ─────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("cards")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("super_types", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("rarity", "text", (col) => col.notNull())
    .addColumn("collector_number", "integer", (col) => col.notNull())
    .addColumn("faction", "text", (col) => col.notNull())
    .addColumn("might", "integer", (col) => col.notNull())
    .addColumn("energy", "integer", (col) => col.notNull())
    .addColumn("power", "integer", (col) => col.notNull())
    .addColumn("keywords", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("effect", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("might_bonus", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("set_id", "text", (col) => col.notNull().references("sets.id").onDelete("restrict"))
    .addColumn("thumbnail_url", "text", (col) => col.notNull())
    .addColumn("full_url", "text", (col) => col.notNull())
    .addColumn("artist", "text", (col) => col.notNull())
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("orientation", "text", (col) => col.notNull())
    .addColumn("public_code", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_cards_set_id").on("cards").column("set_id").execute();

  await db.schema.createIndex("idx_cards_rarity").on("cards").column("rarity").execute();

  await db.schema.createIndex("idx_cards_type").on("cards").column("type").execute();

  // ── Prices ────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("prices")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id").onDelete("cascade"))
    .addColumn("variant", "text", (col) => col.notNull().defaultTo("Normal"))
    .addColumn("price_cents", "integer", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_prices_card_variant")
    .on("prices")
    .columns(["card_id", "variant"])
    .execute();

  await db.schema
    .createIndex("idx_prices_recorded_at")
    .on("prices")
    .column("recorded_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("prices").execute();
  await db.schema.dropTable("cards").execute();
  await db.schema.dropTable("sets").execute();
}
