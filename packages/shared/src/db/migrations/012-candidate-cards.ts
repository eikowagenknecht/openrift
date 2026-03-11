import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("candidate_cards")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("source", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("match_card_id", "text", (col) => col.references("cards.id"))
    .addColumn("source_id", "text", (col) => col.notNull())
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
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("reviewed_by", "text", (col) => col.references("users.id"))
    .addCheckConstraint(
      "chk_candidate_cards_status",
      sql`status IN ('pending', 'accepted', 'rejected')`,
    )
    .addCheckConstraint(
      "chk_candidate_cards_type",
      sql`type IN ('Legend', 'Unit', 'Rune', 'Spell', 'Gear', 'Battlefield')`,
    )
    .execute();

  await db.schema
    .createIndex("idx_candidate_cards_status")
    .on("candidate_cards")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_candidate_cards_match")
    .on("candidate_cards")
    .column("match_card_id")
    .execute();

  await db.schema
    .createTable("candidate_printings")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("candidate_card_id", "uuid", (col) =>
      col.notNull().references("candidate_cards.id").onDelete("cascade"),
    )
    .addColumn("source_id", "text", (col) => col.notNull())
    .addColumn("set_id", "text", (col) => col.notNull())
    .addColumn("set_name", "text")
    .addColumn("collector_number", "integer", (col) => col.notNull())
    .addColumn("rarity", "text", (col) => col.notNull())
    .addColumn("art_variant", "text", (col) => col.notNull())
    .addColumn("is_signed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_promo", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("artist", "text", (col) => col.notNull())
    .addColumn("public_code", "text", (col) => col.notNull())
    .addColumn("printed_rules_text", "text", (col) => col.notNull())
    .addColumn("printed_effect_text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("image_url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "chk_candidate_printings_rarity",
      sql`rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')`,
    )
    .addCheckConstraint("chk_candidate_printings_finish", sql`finish IN ('normal', 'foil')`)
    .execute();

  await db.schema
    .createIndex("idx_candidate_printings_card")
    .on("candidate_printings")
    .column("candidate_card_id")
    .execute();

  await db.schema
    .createTable("card_name_aliases")
    .addColumn("alias", "text", (col) => col.primaryKey())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id"))
    .execute();

  // Make printings.image_url nullable (imported cards may not have images)
  await db.schema
    .alterTable("printings")
    .alterColumn("image_url", (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("card_name_aliases").ifExists().execute();
  await db.schema.dropTable("candidate_printings").ifExists().execute();
  await db.schema.dropTable("candidate_cards").ifExists().execute();

  // DML (UPDATE) is not expressible in the schema builder
  await sql`UPDATE printings SET image_url = '' WHERE image_url IS NULL`.execute(db);
  await db.schema
    .alterTable("printings")
    .alterColumn("image_url", (col) => col.setNotNull())
    .execute();
}
