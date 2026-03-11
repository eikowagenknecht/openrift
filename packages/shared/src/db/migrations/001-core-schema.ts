import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Sets ──────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("sets")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("printed_total", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── Cards ─────────────────────────────────────────────────────────────────
  await db.schema
    .createTable("cards")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("super_types", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("domains", sql`text[]`, (col) => col.notNull())
    .addColumn("might", "integer")
    .addColumn("energy", "integer")
    .addColumn("power", "integer")
    .addColumn("might_bonus", "integer")
    .addColumn("keywords", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("rules_text", "text", (col) => col.notNull())
    .addColumn("effect_text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "chk_cards_type",
      sql`type IN ('Legend', 'Unit', 'Rune', 'Spell', 'Gear', 'Battlefield')`,
    )
    .execute();

  // ── Printings ─────────────────────────────────────────────────────────────
  await db.schema
    .createTable("printings")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id"))
    .addColumn("set_id", "text", (col) => col.notNull().references("sets.id"))
    .addColumn("source_id", "text", (col) => col.notNull())
    .addColumn("collector_number", "integer", (col) => col.notNull())
    .addColumn("rarity", "text", (col) => col.notNull())
    .addColumn("art_variant", "text", (col) => col.notNull())
    .addColumn("is_signed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_promo", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("image_url", "text", (col) => col.notNull())
    .addColumn("artist", "text", (col) => col.notNull())
    .addColumn("public_code", "text", (col) => col.notNull())
    .addColumn("printed_rules_text", "text", (col) => col.notNull())
    .addColumn("printed_effect_text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("uq_printings_variant", [
      "source_id",
      "art_variant",
      "is_signed",
      "is_promo",
      "finish",
    ])
    .addCheckConstraint(
      "chk_printings_rarity",
      sql`rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')`,
    )
    .addCheckConstraint("chk_printings_finish", sql`finish IN ('normal', 'foil')`)
    .execute();

  // ── Indexes ───────────────────────────────────────────────────────────────
  await db.schema.createIndex("idx_printings_card_id").on("printings").column("card_id").execute();
  await db.schema.createIndex("idx_printings_set_id").on("printings").column("set_id").execute();
  await db.schema.createIndex("idx_printings_rarity").on("printings").column("rarity").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("printings").execute();
  await db.schema.dropTable("cards").execute();
  await db.schema.dropTable("sets").execute();
}
