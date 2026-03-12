import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── card_sources ──────────────────────────────────────────────────────────
  await db.schema
    .createTable("card_sources")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("card_id", "text", (col) => col.references("cards.id").onDelete("set null"))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("source_id", "text")
    .addColumn("source_entity_id", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("super_types", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("domains", sql`text[]`, (col) => col.notNull())
    .addColumn("might", "integer")
    .addColumn("energy", "integer")
    .addColumn("power", "integer")
    .addColumn("might_bonus", "integer")
    .addColumn("rules_text", "text", (col) => col.notNull())
    .addColumn("effect_text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("extra_data", sql`jsonb`)
    .addColumn("checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique: one card_source per (source, source_id) when source_id is set
  await sql`CREATE UNIQUE INDEX idx_card_sources_source_source_id
    ON card_sources (source, source_id)
    WHERE source_id IS NOT NULL`.execute(db);

  // Fallback unique: (source, name) for entries without source_id
  await sql`CREATE UNIQUE INDEX idx_card_sources_source_name_no_sid
    ON card_sources (source, name)
    WHERE source_id IS NULL`.execute(db);

  await db.schema
    .createIndex("idx_card_sources_card_id")
    .on("card_sources")
    .column("card_id")
    .execute();

  await sql`CREATE INDEX idx_card_sources_unchecked
    ON card_sources (checked_at) WHERE checked_at IS NULL`.execute(db);

  // ── printing_sources ──────────────────────────────────────────────────────
  await db.schema
    .createTable("printing_sources")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("card_source_id", "uuid", (col) =>
      col.notNull().references("card_sources.id").onDelete("cascade"),
    )
    .addColumn("printing_id", "text", (col) => col.references("printings.id").onDelete("set null"))
    .addColumn("source_id", "text", (col) => col.notNull())
    .addColumn("set_id", "text")
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
    .addColumn("flavor_text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("image_url", "text")
    .addColumn("extra_data", sql`jsonb`)
    .addColumn("checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Partial unique: one source row per card_source+printing when matched
  await sql`CREATE UNIQUE INDEX idx_printing_sources_card_source_printing
    ON printing_sources (card_source_id, printing_id) WHERE printing_id IS NOT NULL`.execute(db);

  await db.schema
    .createIndex("idx_printing_sources_card_source")
    .on("printing_sources")
    .column("card_source_id")
    .execute();

  await db.schema
    .createIndex("idx_printing_sources_printing_id")
    .on("printing_sources")
    .column("printing_id")
    .execute();

  // ── Backfill from cards → card_sources (gallery) ──────────────────────────
  await sql`
    INSERT INTO card_sources (card_id, source, name, type, super_types, domains,
      might, energy, power, might_bonus, rules_text, effect_text, tags,
      checked_at)
    SELECT id, 'gallery', name, type, super_types, domains,
      might, energy, power, might_bonus, rules_text, effect_text, tags,
      now()
    FROM cards
  `.execute(db);

  // ── Backfill from printings → printing_sources (gallery) ──────────────────
  await sql`
    INSERT INTO printing_sources (card_source_id, printing_id, source_id, set_id, set_name,
      collector_number, rarity, art_variant, is_signed, is_promo, finish, artist,
      public_code, printed_rules_text, printed_effect_text, image_url, checked_at)
    SELECT cs.id, p.id, p.source_id, p.set_id, s.name,
      p.collector_number, p.rarity, p.art_variant, p.is_signed, p.is_promo, p.finish,
      p.artist, p.public_code, p.printed_rules_text, p.printed_effect_text,
      pi.original_url, now()
    FROM printings p
    JOIN card_sources cs ON cs.card_id = p.card_id AND cs.source = 'gallery'
    JOIN sets s ON s.id = p.set_id
    LEFT JOIN printing_images pi ON pi.printing_id = p.id
      AND pi.face = 'front' AND pi.source = 'gallery'
  `.execute(db);

  // ── Migrate candidate_cards → card_sources ────────────────────────────────
  // Use DISTINCT ON to deduplicate: multiple candidates may share the same
  // (source, match_card_id) or (source, name) — keep the most recently updated.
  await sql`
    INSERT INTO card_sources (card_id, source, name, type, super_types, domains,
      might, energy, power, might_bonus, rules_text, effect_text, tags,
      checked_at, created_at, updated_at)
    SELECT match_card_id, source, name, type, super_types, domains,
      might, energy, power, might_bonus, rules_text, effect_text, tags,
      CASE WHEN status = 'accepted' THEN reviewed_at ELSE NULL END,
      created_at, updated_at
    FROM (
      SELECT DISTINCT ON (source, COALESCE(match_card_id, name)) *
      FROM candidate_cards
      WHERE status != 'rejected'
      ORDER BY source, COALESCE(match_card_id, name), updated_at DESC
    ) deduped
    ON CONFLICT DO NOTHING
  `.execute(db);

  // ── Migrate candidate_printings → printing_sources ────────────────────────
  // Join back to the migrated card_sources rows. Use ON CONFLICT DO NOTHING
  // in case multiple candidates produced the same printing source key.
  await sql`
    INSERT INTO printing_sources (card_source_id, printing_id, source_id, set_id, set_name,
      collector_number, rarity, art_variant, is_signed, is_promo, finish, artist,
      public_code, printed_rules_text, printed_effect_text, image_url, checked_at,
      created_at)
    SELECT cs.id, NULL, cp.source_id, cp.set_id, cp.set_name,
      cp.collector_number, cp.rarity, cp.art_variant, cp.is_signed, cp.is_promo,
      cp.finish, cp.artist, cp.public_code, cp.printed_rules_text, cp.printed_effect_text,
      cp.image_url, cs.checked_at, cp.created_at
    FROM candidate_printings cp
    JOIN candidate_cards cc ON cc.id = cp.candidate_card_id
    JOIN card_sources cs ON cs.source = cc.source AND cs.name = cc.name
    WHERE cc.status != 'rejected'
    ON CONFLICT DO NOTHING
  `.execute(db);

  // ── Drop candidate tables ────────────────────────────────────────────────
  await db.schema.dropTable("candidate_printings").execute();
  await db.schema.dropTable("candidate_cards").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-create candidate tables (minimal — just enough to reverse the migration)
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
    .execute();

  await db.schema.dropTable("printing_sources").execute();
  await db.schema.dropTable("card_sources").execute();
}
