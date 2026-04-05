import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Functions ──────────────────────────────────────────────────────────

  await sql`
    CREATE FUNCTION candidate_cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE FUNCTION card_name_aliases_set_norm_name() RETURNS trigger AS $$
    BEGIN
      -- norm_name is set directly by the application; this trigger is a safety net
      -- in case someone inserts with a raw value that needs normalising.
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE FUNCTION cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE FUNCTION prevent_nonempty_collection_delete() RETURNS trigger AS $$
    BEGIN
      -- Allow if the owning user no longer exists (user deletion cascade).
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
        RETURN OLD;
      END IF;
      -- Block if the collection still has copies
      IF EXISTS (SELECT 1 FROM copies WHERE collection_id = OLD.id LIMIT 1) THEN
        RAISE EXCEPTION
          'Cannot delete collection % — it still has copies. Move them first.',
          OLD.id;
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  // ── 2. Tables ────────────────────────────────────────────────────────────

  // -- users (referenced by many tables)
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("email_verified", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("image", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- accounts
  await db.schema
    .createTable("accounts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("account_id", "text", (col) => col.notNull())
    .addColumn("provider_id", "text", (col) => col.notNull())
    .addColumn("access_token", "text")
    .addColumn("refresh_token", "text")
    .addColumn("access_token_expires_at", "timestamptz")
    .addColumn("refresh_token_expires_at", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("id_token", "text")
    .addColumn("password", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- sessions
  await db.schema
    .createTable("sessions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("ip_address", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- verifications
  await db.schema
    .createTable("verifications")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- admins
  await db.schema
    .createTable("admins")
    .addColumn("user_id", "text", (col) => col.primaryKey())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- feature_flags
  await db.schema
    .createTable("feature_flags")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("enabled", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- user_feature_flags
  await db.schema
    .createTable("user_feature_flags")
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("flag_key", "text", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_feature_flags_pk", ["user_id", "flag_key"])
    .execute();

  // -- user_preferences
  await db.schema
    .createTable("user_preferences")
    .addColumn("user_id", "text", (col) => col.primaryKey())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("data", "jsonb", (col) =>
      col
        .defaultTo(
          sql`'{"showImages": true, "richEffects": true, "visibleFields": {"type": true, "price": true, "title": true, "number": true, "rarity": true}, "marketplaceOrder": ["tcgplayer", "cardmarket", "cardtrader"]}'::jsonb`,
        )
        .notNull(),
    )
    .addCheckConstraint("user_preferences_data_max_size", sql`length((data)::text) <= 8192`)
    .execute();

  // -- formats
  await db.schema
    .createTable("formats")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_formats_id_not_empty", sql`id <> ''`)
    .addCheckConstraint("chk_formats_name_not_empty", sql`name <> ''`)
    .execute();

  // -- languages
  await db.schema
    .createTable("languages")
    .addColumn("code", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("languages_code_not_empty", sql`code <> ''`)
    .addCheckConstraint("languages_name_not_empty", sql`name <> ''`)
    .execute();

  // -- promo_types
  await db.schema
    .createTable("promo_types")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("promo_types_slug_check", sql`slug <> ''`)
    .addCheckConstraint("promo_types_label_check", sql`label <> ''`)
    .execute();

  // -- keyword_styles
  await db.schema
    .createTable("keyword_styles")
    .addColumn("name", "text", (col) => col.primaryKey())
    .addColumn("color", "text", (col) => col.notNull())
    .addColumn("dark_text", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("keyword_styles_color_check", sql`color ~ '^#[0-9a-fA-F]{6}$'`)
    .addCheckConstraint("keyword_styles_name_check", sql`name <> ''`)
    .execute();

  // -- site_settings
  await db.schema
    .createTable("site_settings")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.defaultTo("web").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("site_settings_key_check", sql`key <> ''`)
    .addCheckConstraint(
      "site_settings_scope_check",
      sql`scope = ANY (ARRAY['web'::text, 'api'::text])`,
    )
    .execute();

  // -- provider_settings
  await db.schema
    .createTable("provider_settings")
    .addColumn("provider", "text", (col) => col.primaryKey())
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("is_hidden", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("provider_settings_provider_check", sql`provider <> ''`)
    .execute();

  // -- sets
  await db.schema
    .createTable("sets")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("printed_total", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("released_at", "date")
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addPrimaryKeyConstraint("sets_pkey", ["id"])
    .addCheckConstraint("chk_sets_name_not_empty", sql`name <> ''`)
    .addCheckConstraint("chk_sets_printed_total_non_negative", sql`printed_total >= 0`)
    .addCheckConstraint("chk_sets_slug_not_empty", sql`slug <> ''`)
    .execute();

  // -- cards
  await db.schema
    .createTable("cards")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("super_types", sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`).notNull())
    .addColumn("domains", sql`text[]`, (col) => col.notNull())
    .addColumn("might", "integer")
    .addColumn("energy", "integer")
    .addColumn("power", "integer")
    .addColumn("might_bonus", "integer")
    .addColumn("keywords", sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`).notNull())
    .addColumn("rules_text", "text")
    .addColumn("effect_text", "text")
    .addColumn("tags", sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addColumn("norm_name", "text", (col) => col.notNull())
    .addColumn("comment", "text")
    .addPrimaryKeyConstraint("cards_pkey", ["id"])
    .addCheckConstraint("chk_cards_domains_not_empty", sql`array_length(domains, 1) > 0`)
    .addCheckConstraint(
      "chk_cards_domains_values",
      sql`domains <@ ARRAY['Fury'::text, 'Calm'::text, 'Mind'::text, 'Body'::text, 'Chaos'::text, 'Order'::text, 'Colorless'::text]`,
    )
    .addCheckConstraint("chk_cards_energy_non_negative", sql`energy >= 0`)
    .addCheckConstraint("chk_cards_might_bonus_non_negative", sql`might_bonus >= 0`)
    .addCheckConstraint("chk_cards_might_non_negative", sql`might >= 0`)
    .addCheckConstraint("chk_cards_name_not_empty", sql`name <> ''`)
    .addCheckConstraint("chk_cards_no_empty_comment", sql`comment <> ''`)
    .addCheckConstraint("chk_cards_no_empty_effect_text", sql`effect_text <> ''`)
    .addCheckConstraint("chk_cards_no_empty_rules_text", sql`rules_text <> ''`)
    .addCheckConstraint("chk_cards_power_non_negative", sql`power >= 0`)
    .addCheckConstraint("chk_cards_slug_not_empty", sql`slug <> ''`)
    .addCheckConstraint(
      "chk_cards_super_types_values",
      sql`super_types <@ ARRAY['Basic'::text, 'Champion'::text, 'Signature'::text, 'Token'::text]`,
    )
    .addCheckConstraint(
      "chk_cards_type",
      sql`type = ANY (ARRAY['Legend'::text, 'Unit'::text, 'Rune'::text, 'Spell'::text, 'Gear'::text, 'Battlefield'::text, 'Other'::text])`,
    )
    .execute();

  // -- card_name_aliases
  await db.schema
    .createTable("card_name_aliases")
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("norm_name", "text", (col) => col.primaryKey())
    .execute();

  // -- card_bans
  await db.schema
    .createTable("card_bans")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("format_id", "text", (col) => col.notNull())
    .addColumn("banned_at", "date", (col) => col.notNull())
    .addColumn("unbanned_at", "date")
    .addColumn("reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_card_bans_reason_not_empty", sql`reason <> ''`)
    .execute();

  // -- printings
  await db.schema
    .createTable("printings")
    .addColumn("short_code", "text", (col) => col.notNull())
    .addColumn("collector_number", "integer", (col) => col.notNull())
    .addColumn("rarity", "text", (col) => col.notNull())
    .addColumn("art_variant", "text", (col) => col.notNull())
    .addColumn("is_signed", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("artist", "text", (col) => col.notNull())
    .addColumn("public_code", "text", (col) => col.notNull())
    .addColumn("printed_rules_text", "text")
    .addColumn("printed_effect_text", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("flavor_text", "text")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addColumn("set_id", "uuid", (col) => col.notNull())
    .addColumn("comment", "text")
    .addColumn("promo_type_id", "uuid")
    .addColumn("language", "text", (col) => col.defaultTo("EN").notNull())
    .addColumn("printed_name", "text")
    .addPrimaryKeyConstraint("printings_pkey", ["id"])
    .addCheckConstraint(
      "chk_printings_art_variant",
      sql`art_variant = ANY (ARRAY['normal'::text, 'altart'::text, 'overnumbered'::text])`,
    )
    .addCheckConstraint("chk_printings_artist_not_empty", sql`artist <> ''`)
    .addCheckConstraint("chk_printings_collector_number_positive", sql`collector_number > 0`)
    .addCheckConstraint(
      "chk_printings_finish",
      sql`finish = ANY (ARRAY['normal'::text, 'foil'::text])`,
    )
    .addCheckConstraint("chk_printings_no_empty_comment", sql`comment <> ''`)
    .addCheckConstraint("chk_printings_no_empty_flavor_text", sql`flavor_text <> ''`)
    .addCheckConstraint(
      "chk_printings_no_empty_printed_effect_text",
      sql`printed_effect_text <> ''`,
    )
    .addCheckConstraint("chk_printings_no_empty_printed_name", sql`printed_name <> ''`)
    .addCheckConstraint("chk_printings_no_empty_printed_rules_text", sql`printed_rules_text <> ''`)
    .addCheckConstraint("chk_printings_public_code_not_empty", sql`public_code <> ''`)
    .addCheckConstraint(
      "chk_printings_rarity",
      sql`rarity = ANY (ARRAY['Common'::text, 'Uncommon'::text, 'Rare'::text, 'Epic'::text, 'Showcase'::text])`,
    )
    .addCheckConstraint("chk_printings_short_code_not_empty", sql`short_code <> ''`)
    .execute();

  // -- printing_images
  await db.schema
    .createTable("printing_images")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("face", "text", (col) => col.defaultTo("front").notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("original_url", "text")
    .addColumn("rehosted_url", "text")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addCheckConstraint(
      "chk_printing_images_face",
      sql`face = ANY (ARRAY['front'::text, 'back'::text])`,
    )
    .addCheckConstraint(
      "chk_printing_images_has_url",
      sql`original_url IS NOT NULL OR rehosted_url IS NOT NULL`,
    )
    .addCheckConstraint("chk_printing_images_no_empty_original_url", sql`original_url <> ''`)
    .addCheckConstraint("chk_printing_images_no_empty_rehosted_url", sql`rehosted_url <> ''`)
    .addCheckConstraint("chk_printing_images_provider_not_empty", sql`provider <> ''`)
    .execute();

  // -- printing_link_overrides
  await db.schema
    .createTable("printing_link_overrides")
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("printing_link_overrides_pkey", ["external_id", "finish"])
    .addCheckConstraint("chk_plo_no_empty_external_id", sql`external_id <> ''`)
    .execute();

  // -- candidate_cards
  await db.schema
    .createTable("candidate_cards")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("short_code", "text")
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text")
    .addColumn("super_types", sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`).notNull())
    .addColumn("domains", sql`text[]`, (col) => col.notNull())
    .addColumn("might", "integer")
    .addColumn("energy", "integer")
    .addColumn("power", "integer")
    .addColumn("might_bonus", "integer")
    .addColumn("rules_text", "text")
    .addColumn("effect_text", "text")
    .addColumn("tags", sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`).notNull())
    .addColumn("extra_data", "jsonb")
    .addColumn("checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("norm_name", "text", (col) => col.notNull())
    .addCheckConstraint("chk_candidate_cards_energy_non_negative", sql`energy >= 0`)
    .addCheckConstraint("chk_candidate_cards_might_bonus_non_negative", sql`might_bonus >= 0`)
    .addCheckConstraint("chk_candidate_cards_might_non_negative", sql`might >= 0`)
    .addCheckConstraint("chk_candidate_cards_name_not_empty", sql`name <> ''`)
    .addCheckConstraint("chk_candidate_cards_no_empty_effect_text", sql`effect_text <> ''`)
    .addCheckConstraint("chk_candidate_cards_no_empty_external_id", sql`external_id <> ''`)
    .addCheckConstraint(
      "chk_candidate_cards_no_empty_extra_data",
      sql`extra_data <> '{}'::jsonb AND extra_data <> 'null'::jsonb`,
    )
    .addCheckConstraint("chk_candidate_cards_no_empty_rules_text", sql`rules_text <> ''`)
    .addCheckConstraint("chk_candidate_cards_no_empty_short_code", sql`short_code <> ''`)
    .addCheckConstraint("chk_candidate_cards_no_empty_type", sql`type <> ''`)
    .addCheckConstraint("chk_candidate_cards_power_non_negative", sql`power >= 0`)
    .addCheckConstraint("chk_candidate_cards_provider_not_empty", sql`provider <> ''`)
    .execute();

  // -- candidate_printings
  await db.schema
    .createTable("candidate_printings")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("candidate_card_id", "uuid", (col) => col.notNull())
    .addColumn("short_code", "text", (col) => col.notNull())
    .addColumn("set_id", "text")
    .addColumn("set_name", "text")
    .addColumn("collector_number", "integer")
    .addColumn("rarity", "text")
    .addColumn("art_variant", "text")
    .addColumn("is_signed", "boolean")
    .addColumn("finish", "text")
    .addColumn("artist", "text")
    .addColumn("public_code", "text")
    .addColumn("printed_rules_text", "text")
    .addColumn("printed_effect_text", "text", (col) => col.defaultTo(""))
    .addColumn("flavor_text", "text", (col) => col.defaultTo(""))
    .addColumn("image_url", "text")
    .addColumn("extra_data", "jsonb")
    .addColumn("checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("printing_id", "uuid")
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("promo_type_id", "uuid")
    .addColumn("language", "text")
    .addColumn("printed_name", "text")
    .addCheckConstraint(
      "chk_candidate_printings_collector_number_positive",
      sql`collector_number > 0`,
    )
    .addCheckConstraint("chk_candidate_printings_no_empty_art_variant", sql`art_variant <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_artist", sql`artist <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_external_id", sql`external_id <> ''`)
    .addCheckConstraint(
      "chk_candidate_printings_no_empty_extra_data",
      sql`extra_data <> '{}'::jsonb AND extra_data <> 'null'::jsonb`,
    )
    .addCheckConstraint("chk_candidate_printings_no_empty_finish", sql`finish <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_flavor_text", sql`flavor_text <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_image_url", sql`image_url <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_language", sql`language <> ''`)
    .addCheckConstraint(
      "chk_candidate_printings_no_empty_printed_effect_text",
      sql`printed_effect_text <> ''`,
    )
    .addCheckConstraint("chk_candidate_printings_no_empty_printed_name", sql`printed_name <> ''`)
    .addCheckConstraint(
      "chk_candidate_printings_no_empty_printed_rules_text",
      sql`printed_rules_text <> ''`,
    )
    .addCheckConstraint("chk_candidate_printings_no_empty_rarity", sql`rarity <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_set_id", sql`set_id <> ''`)
    .addCheckConstraint("chk_candidate_printings_no_empty_set_name", sql`set_name <> ''`)
    .addCheckConstraint("chk_candidate_printings_public_code_not_empty", sql`public_code <> ''`)
    .addCheckConstraint("chk_candidate_printings_short_code_not_empty", sql`short_code <> ''`)
    .execute();

  // -- ignored_candidate_cards
  await db.schema
    .createTable("ignored_candidate_cards")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_ignored_candidate_cards_external_id_not_empty", sql`external_id <> ''`)
    .addCheckConstraint("chk_ignored_candidate_cards_provider_not_empty", sql`provider <> ''`)
    .execute();

  // -- ignored_candidate_printings
  await db.schema
    .createTable("ignored_candidate_printings")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("finish", "text")
    .addCheckConstraint(
      "chk_ignored_candidate_printings_external_id_not_empty",
      sql`external_id <> ''`,
    )
    .addCheckConstraint("chk_ignored_candidate_printings_no_empty_finish", sql`finish <> ''`)
    .addCheckConstraint("chk_ignored_candidate_printings_provider_not_empty", sql`provider <> ''`)
    .execute();

  // -- collections
  await db.schema
    .createTable("collections")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("available_for_deckbuilding", "boolean", (col) => col.defaultTo(true).notNull())
    .addColumn("is_inbox", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_collections_name_not_empty", sql`name <> ''`)
    .execute();

  // -- copies
  await db.schema
    .createTable("copies")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("collection_id", "uuid", (col) => col.notNull())
    .addColumn("acquisition_source_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .execute();

  // -- collection_events
  await db.schema
    .createTable("collection_events")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("copy_id", "uuid")
    .addColumn("from_collection_id", "uuid")
    .addColumn("from_collection_name", "text")
    .addColumn("to_collection_id", "uuid")
    .addColumn("to_collection_name", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint(
      "chk_collection_events_action",
      sql`action = ANY (ARRAY['added'::text, 'removed'::text, 'moved'::text])`,
    )
    .addCheckConstraint(
      "chk_collection_events_collection_presence",
      sql`(action = 'added' AND to_collection_id IS NOT NULL) OR (action = 'removed' AND from_collection_id IS NOT NULL) OR (action = 'moved' AND from_collection_id IS NOT NULL AND to_collection_id IS NOT NULL)`,
    )
    .execute();

  // -- acquisition_sources
  await db.schema
    .createTable("acquisition_sources")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("sources_pkey", ["id"])
    .execute();

  // -- decks
  await db.schema
    .createTable("decks")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("format", "text", (col) => col.notNull())
    .addColumn("is_wanted", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("is_public", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_decks_name_not_empty", sql`name <> ''`)
    .execute();

  // -- deck_cards
  await db.schema
    .createTable("deck_cards")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull())
    .addColumn("zone", "text", (col) => col.notNull())
    .addColumn("quantity", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addCheckConstraint("chk_deck_cards_quantity", sql`quantity > 0`)
    .addCheckConstraint(
      "chk_deck_cards_zone",
      sql`zone = ANY (ARRAY['main'::text, 'sideboard'::text, 'legend'::text, 'champion'::text, 'runes'::text, 'battlefield'::text, 'overflow'::text])`,
    )
    .execute();

  // -- marketplace_groups
  await db.schema
    .createTable("marketplace_groups")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("abbreviation", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addPrimaryKeyConstraint("marketplace_groups_pkey", ["id"])
    .execute();

  // -- marketplace_products
  await db.schema
    .createTable("marketplace_products")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("marketplace_sources_pkey", ["id"])
    .addCheckConstraint("chk_marketplace_products_external_id_positive", sql`external_id > 0`)
    .addCheckConstraint("chk_marketplace_products_marketplace_not_empty", sql`marketplace <> ''`)
    .addCheckConstraint("chk_marketplace_products_product_name_not_empty", sql`product_name <> ''`)
    .execute();

  // -- marketplace_ignored_products
  await db.schema
    .createTable("marketplace_ignored_products")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("marketplace_ignored_products_pkey", [
      "marketplace",
      "external_id",
      "finish",
    ])
    .execute();

  // -- marketplace_snapshots
  await db.schema
    .createTable("marketplace_snapshots")
    .addColumn("recorded_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addColumn("product_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("marketplace_snapshots_pkey", ["id"])
    .addCheckConstraint("chk_marketplace_snapshots_avg1_cents_non_negative", sql`avg1_cents >= 0`)
    .addCheckConstraint("chk_marketplace_snapshots_avg30_cents_non_negative", sql`avg30_cents >= 0`)
    .addCheckConstraint("chk_marketplace_snapshots_avg7_cents_non_negative", sql`avg7_cents >= 0`)
    .addCheckConstraint("chk_marketplace_snapshots_high_cents_non_negative", sql`high_cents >= 0`)
    .addCheckConstraint("chk_marketplace_snapshots_low_cents_non_negative", sql`low_cents >= 0`)
    .addCheckConstraint(
      "chk_marketplace_snapshots_market_cents_non_negative",
      sql`market_cents >= 0`,
    )
    .addCheckConstraint("chk_marketplace_snapshots_mid_cents_non_negative", sql`mid_cents >= 0`)
    .addCheckConstraint("chk_marketplace_snapshots_trend_cents_non_negative", sql`trend_cents >= 0`)
    .execute();

  // -- marketplace_staging
  await db.schema
    .createTable("marketplace_staging")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).notNull())
    .addPrimaryKeyConstraint("marketplace_staging_pkey", ["id"])
    .execute();

  // -- marketplace_staging_card_overrides
  await db.schema
    .createTable("marketplace_staging_card_overrides")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("card_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("marketplace_staging_card_overrides_pkey", [
      "marketplace",
      "external_id",
      "finish",
    ])
    .execute();

  // -- trade_lists
  await db.schema
    .createTable("trade_lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- trade_list_items
  await db.schema
    .createTable("trade_list_items")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("trade_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("copy_id", "uuid", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- wish_lists
  await db.schema
    .createTable("wish_lists")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("rules", "jsonb")
    .addColumn("share_token", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  // -- wish_list_items
  await db.schema
    .createTable("wish_list_items")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("wish_list_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("quantity_desired", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("printing_id", "uuid")
    .addColumn("card_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_wish_list_items_quantity", sql`quantity_desired > 0`)
    .addCheckConstraint(
      "chk_wish_list_items_target_xor",
      sql`(card_id IS NOT NULL) <> (printing_id IS NOT NULL)`,
    )
    .execute();

  // ── 3. Additional unique constraints and composite PKs ───────────────────

  // cards
  await db.schema.alterTable("cards").addUniqueConstraint("cards_slug_key", ["slug"]).execute();

  // users
  await db.schema.alterTable("users").addUniqueConstraint("users_email_key", ["email"]).execute();

  // collections
  await db.schema
    .alterTable("collections")
    .addUniqueConstraint("collections_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("collections")
    .addUniqueConstraint("uq_collections_id_user", ["id", "user_id"])
    .execute();

  // copies
  await db.schema
    .alterTable("copies")
    .addUniqueConstraint("uq_copies_id_user", ["id", "user_id"])
    .execute();

  // decks
  await db.schema
    .alterTable("decks")
    .addUniqueConstraint("decks_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("decks")
    .addUniqueConstraint("uq_decks_id_user", ["id", "user_id"])
    .execute();

  // sets
  await db.schema.alterTable("sets").addUniqueConstraint("sets_slug_key", ["slug"]).execute();

  // promo_types
  await db.schema
    .alterTable("promo_types")
    .addUniqueConstraint("promo_types_slug_key", ["slug"])
    .execute();

  // marketplace_groups
  await db.schema
    .alterTable("marketplace_groups")
    .addUniqueConstraint("marketplace_groups_marketplace_group_id_key", ["marketplace", "group_id"])
    .execute();

  // marketplace_products
  await db.schema
    .alterTable("marketplace_products")
    .addUniqueConstraint("marketplace_sources_marketplace_printing_id_key", [
      "marketplace",
      "printing_id",
    ])
    .execute();

  // marketplace_snapshots
  await db.schema
    .alterTable("marketplace_snapshots")
    .addUniqueConstraint("marketplace_snapshots_product_id_recorded_at_key", [
      "product_id",
      "recorded_at",
    ])
    .execute();

  // marketplace_staging
  await db.schema
    .alterTable("marketplace_staging")
    .addUniqueConstraint("marketplace_staging_marketplace_external_id_finish_recorded_at_", [
      "marketplace",
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  // acquisition_sources
  await db.schema
    .alterTable("acquisition_sources")
    .addUniqueConstraint("uq_sources_id_user", ["id", "user_id"])
    .execute();

  // trade_lists
  await db.schema
    .alterTable("trade_lists")
    .addUniqueConstraint("trade_lists_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addUniqueConstraint("uq_trade_lists_id_user", ["id", "user_id"])
    .execute();

  // trade_list_items
  await db.schema
    .alterTable("trade_list_items")
    .addUniqueConstraint("uq_trade_list_items", ["trade_list_id", "copy_id"])
    .execute();

  // wish_lists
  await db.schema
    .alterTable("wish_lists")
    .addUniqueConstraint("wish_lists_share_token_key", ["share_token"])
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addUniqueConstraint("uq_wish_lists_id_user", ["id", "user_id"])
    .execute();

  // printings — NULLS NOT DISTINCT (requires raw SQL)
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, promo_type_id, language)
  `.execute(db);

  // printings — variant unique
  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "short_code",
      "art_variant",
      "is_signed",
      "promo_type_id",
      "rarity",
      "finish",
    ])
    .execute();

  // ── 4. Indexes ───────────────────────────────────────────────────────────

  // Simple btree indexes (builder)
  await db.schema.createIndex("idx_accounts_user_id").on("accounts").column("user_id").execute();

  await db.schema
    .createIndex("idx_acquisition_sources_user_id")
    .on("acquisition_sources")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_candidate_cards_norm_name")
    .on("candidate_cards")
    .column("norm_name")
    .execute();

  await db.schema
    .createIndex("idx_candidate_printings_candidate_card")
    .on("candidate_printings")
    .column("candidate_card_id")
    .execute();

  await db.schema.createIndex("idx_cards_norm_name").on("cards").column("norm_name").execute();

  await db.schema
    .createIndex("idx_collection_events_copy")
    .on("collection_events")
    .column("copy_id")
    .execute();

  await db.schema
    .createIndex("idx_collection_events_user_created")
    .on("collection_events")
    .columns(["user_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_collections_user_id")
    .on("collections")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_copies_acquisition_source")
    .on("copies")
    .column("acquisition_source_id")
    .execute();

  await db.schema
    .createIndex("idx_copies_collection")
    .on("copies")
    .column("collection_id")
    .execute();

  await db.schema
    .createIndex("idx_copies_user_printing")
    .on("copies")
    .columns(["user_id", "printing_id"])
    .execute();

  await db.schema.createIndex("idx_deck_cards_deck").on("deck_cards").column("deck_id").execute();

  await db.schema.createIndex("idx_decks_user_id").on("decks").column("user_id").execute();

  await db.schema
    .createIndex("idx_marketplace_snapshots_product_id_recorded_at")
    .on("marketplace_snapshots")
    .columns(["product_id", "recorded_at"])
    .execute();

  await db.schema
    .createIndex("idx_marketplace_sources_printing_id")
    .on("marketplace_products")
    .column("printing_id")
    .execute();

  await db.schema
    .createIndex("idx_marketplace_staging_marketplace_group_id")
    .on("marketplace_staging")
    .columns(["marketplace", "group_id"])
    .execute();

  await db.schema
    .createIndex("idx_printing_images_printing_id")
    .on("printing_images")
    .column("printing_id")
    .execute();

  await db.schema
    .createIndex("idx_printing_sources_printing_id")
    .on("candidate_printings")
    .column("printing_id")
    .execute();

  await db.schema.createIndex("idx_printings_card_id").on("printings").column("card_id").execute();

  await db.schema.createIndex("idx_printings_rarity").on("printings").column("rarity").execute();

  await db.schema.createIndex("idx_printings_set_id").on("printings").column("set_id").execute();

  await db.schema.createIndex("idx_sessions_user_id").on("sessions").column("user_id").execute();

  await db.schema
    .createIndex("idx_trade_list_items_copy")
    .on("trade_list_items")
    .column("copy_id")
    .execute();

  await db.schema
    .createIndex("idx_trade_list_items_list")
    .on("trade_list_items")
    .column("trade_list_id")
    .execute();

  await db.schema
    .createIndex("idx_trade_lists_user_id")
    .on("trade_lists")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_wish_list_items_list")
    .on("wish_list_items")
    .column("wish_list_id")
    .execute();

  await db.schema
    .createIndex("idx_wish_lists_user_id")
    .on("wish_lists")
    .column("user_id")
    .execute();

  // Simple unique indexes (builder)
  await db.schema
    .createIndex("idx_candidate_printings_card_external_id")
    .on("candidate_printings")
    .columns(["candidate_card_id", "external_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_printing_images_provider")
    .on("printing_images")
    .columns(["printing_id", "face", "provider"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_sessions_token")
    .on("sessions")
    .column("token")
    .unique()
    .execute();

  await db.schema
    .createIndex("uq_deck_cards")
    .on("deck_cards")
    .columns(["deck_id", "card_id", "zone"])
    .unique()
    .execute();

  await db.schema
    .createIndex("uq_wish_list_items_card")
    .on("wish_list_items")
    .columns(["wish_list_id", "card_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("uq_wish_list_items_printing")
    .on("wish_list_items")
    .columns(["wish_list_id", "printing_id"])
    .unique()
    .execute();

  // Partial / conditional unique indexes (raw SQL)
  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id
      ON candidate_cards (provider, external_id)
      WHERE external_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_name_no_sid
      ON candidate_cards (provider, name)
      WHERE short_code IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_candidate_cards_provider_short_code
      ON candidate_cards (provider, short_code)
      WHERE short_code IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_candidate_cards_unchecked
      ON candidate_cards (checked_at)
      WHERE checked_at IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_candidate_cards_provider_external
      ON ignored_candidate_cards (provider, external_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_candidate_printings_provider_external_finish
      ON ignored_candidate_printings (provider, external_id, COALESCE(finish, ''))
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_printing_images_active
      ON printing_images (printing_id, face)
      WHERE is_active = true
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_card_bans_active
      ON card_bans (card_id, format_id)
      WHERE unbanned_at IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_collections_user_inbox
      ON collections (user_id)
      WHERE is_inbox = true
  `.execute(db);

  // ── 5. Triggers ──────────────────────────────────────────────────────────

  await sql`
    CREATE TRIGGER keyword_styles_set_updated_at
      BEFORE UPDATE ON keyword_styles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER site_settings_set_updated_at
      BEFORE UPDATE ON site_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER trg_candidate_cards_norm_name
      BEFORE INSERT OR UPDATE OF name ON candidate_cards
      FOR EACH ROW EXECUTE FUNCTION candidate_cards_set_norm_name();

    CREATE TRIGGER trg_cards_norm_name
      BEFORE INSERT OR UPDATE OF name ON cards
      FOR EACH ROW EXECUTE FUNCTION cards_set_norm_name();

    CREATE TRIGGER trg_prevent_nonempty_collection_delete
      BEFORE DELETE ON collections
      FOR EACH ROW EXECUTE FUNCTION prevent_nonempty_collection_delete();

    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON acquisition_sources
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON admins
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidate_printings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON collections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON copies
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON decks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON feature_flags
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON languages
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_groups
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_ignored_products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_staging
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON printing_images
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON printings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON promo_types
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON provider_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON sessions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON sets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON trade_list_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON trade_lists
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON verifications
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON wish_list_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON wish_lists
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER user_preferences_set_updated_at
      BEFORE UPDATE ON user_preferences
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `.execute(db);

  // ── 6. Foreign keys ──────────────────────────────────────────────────────

  // Simple FKs (builder)
  await db.schema
    .alterTable("accounts")
    .addForeignKeyConstraint("accounts_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("admins")
    .addForeignKeyConstraint("admins_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("candidate_printings")
    .addForeignKeyConstraint(
      "candidate_printings_candidate_card_id_fkey",
      ["candidate_card_id"],
      "candidate_cards",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("card_bans")
    .addForeignKeyConstraint("card_bans_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("card_bans")
    .addForeignKeyConstraint("card_bans_format_id_fkey", ["format_id"], "formats", ["id"])
    .execute();

  await db.schema
    .alterTable("card_name_aliases")
    .addForeignKeyConstraint("card_name_aliases_card_id_fkey", ["card_id"], "cards", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("collection_events")
    .addForeignKeyConstraint("collection_events_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("collection_events")
    .addForeignKeyConstraint("collection_events_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("collections")
    .addForeignKeyConstraint("collections_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("copies")
    .addForeignKeyConstraint("copies_printing_id_fkey", ["printing_id"], "printings", ["id"])
    .execute();

  await db.schema
    .alterTable("copies")
    .addForeignKeyConstraint("copies_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("deck_cards")
    .addForeignKeyConstraint("deck_cards_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("deck_cards")
    .addForeignKeyConstraint("deck_cards_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("decks")
    .addForeignKeyConstraint("decks_format_fkey", ["format"], "formats", ["id"])
    .execute();

  await db.schema
    .alterTable("decks")
    .addForeignKeyConstraint("decks_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("marketplace_snapshots")
    .addForeignKeyConstraint(
      "marketplace_snapshots_product_id_fkey",
      ["product_id"],
      "marketplace_products",
      ["id"],
    )
    .execute();

  await db.schema
    .alterTable("marketplace_products")
    .addForeignKeyConstraint(
      "marketplace_sources_group_fkey",
      ["marketplace", "group_id"],
      "marketplace_groups",
      ["marketplace", "group_id"],
    )
    .execute();

  await db.schema
    .alterTable("marketplace_products")
    .addForeignKeyConstraint("marketplace_sources_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("marketplace_staging_card_overrides")
    .addForeignKeyConstraint(
      "marketplace_staging_card_overrides_card_id_fkey",
      ["card_id"],
      "cards",
      ["id"],
    )
    .execute();

  await db.schema
    .alterTable("printing_images")
    .addForeignKeyConstraint("printing_images_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("candidate_printings")
    .addForeignKeyConstraint("printing_sources_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("candidate_printings")
    .addForeignKeyConstraint(
      "printing_sources_promo_type_id_fkey",
      ["promo_type_id"],
      "promo_types",
      ["id"],
    )
    .execute();

  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_language_fk", ["language"], "languages", ["code"])
    .execute();

  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_promo_type_id_fkey", ["promo_type_id"], "promo_types", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_set_id_fkey", ["set_id"], "sets", ["id"])
    .execute();

  await db.schema
    .alterTable("printing_link_overrides")
    .addForeignKeyConstraint("fk_plo_printing_id", ["printing_id"], "printings", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("sessions")
    .addForeignKeyConstraint("sessions_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("acquisition_sources")
    .addForeignKeyConstraint("sources_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("trade_lists")
    .addForeignKeyConstraint("trade_lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("user_feature_flags")
    .addForeignKeyConstraint("user_feature_flags_flag_key_fkey", ["flag_key"], "feature_flags", [
      "key",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("user_feature_flags")
    .addForeignKeyConstraint("user_feature_flags_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("user_preferences")
    .addForeignKeyConstraint("user_preferences_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint("wish_list_items_card_id_fkey", ["card_id"], "cards", ["id"])
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint("wish_list_items_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .execute();

  await db.schema
    .alterTable("wish_lists")
    .addForeignKeyConstraint("wish_lists_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // Complex FKs with ON DELETE SET NULL (column) — raw SQL
  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_copy_user
      FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
      ON DELETE SET NULL (copy_id)
  `.execute(db);

  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_from_collection_user
      FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (from_collection_id)
  `.execute(db);

  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT fk_collection_events_to_collection_user
      FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
      ON DELETE SET NULL (to_collection_id)
  `.execute(db);

  await sql`
    ALTER TABLE copies
      ADD CONSTRAINT fk_copies_acquisition_source_user
      FOREIGN KEY (acquisition_source_id, user_id) REFERENCES acquisition_sources(id, user_id)
      ON DELETE SET NULL (acquisition_source_id)
  `.execute(db);

  // Composite FK with cascade (builder works for these)
  await db.schema
    .alterTable("copies")
    .addForeignKeyConstraint(
      "fk_copies_collection_user",
      ["collection_id", "user_id"],
      "collections",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("trade_list_items")
    .addForeignKeyConstraint("fk_trade_list_items_copy_user", ["copy_id", "user_id"], "copies", [
      "id",
      "user_id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("trade_list_items")
    .addForeignKeyConstraint(
      "fk_trade_list_items_list_user",
      ["trade_list_id", "user_id"],
      "trade_lists",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("wish_list_items")
    .addForeignKeyConstraint(
      "fk_wish_list_items_list_user",
      ["wish_list_id", "user_id"],
      "wish_lists",
      ["id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  // ── 7. Seed data ─────────────────────────────────────────────────────────

  await sql`
    INSERT INTO formats (id, name) VALUES
      ('standard', 'Standard'),
      ('freeform', 'Freeform');

    INSERT INTO languages (code, name, sort_order) VALUES
      ('EN', 'English', 1),
      ('FR', 'French', 2),
      ('ZH', 'Chinese', 3);

    INSERT INTO promo_types (slug, label) VALUES
      ('promo', 'Promo');

    INSERT INTO keyword_styles (name, color, dark_text) VALUES
      ('Accelerate',    '#24705f', false),
      ('Action',        '#24705f', false),
      ('Ambush',        '#24705f', false),
      ('Assault',       '#cd346f', false),
      ('Backline',      '#cd346f', false),
      ('Buff',          '#707070', false),
      ('Deathknell',    '#95b229', true),
      ('Deflect',       '#95b229', true),
      ('Equip',         '#707070', false),
      ('Ganking',       '#95b229', true),
      ('Hidden',        '#24705f', false),
      ('Hunt',          '#95b229', true),
      ('Legion',        '#24705f', false),
      ('Level',         '#95b229', true),
      ('Mighty',        '#707070', false),
      ('Predict',       '#707070', false),
      ('Quick-Draw',    '#24705f', false),
      ('Reaction',      '#24705f', false),
      ('Repeat',        '#24705f', false),
      ('Shield',        '#cd346f', false),
      ('Stun',          '#707070', false),
      ('Tank',          '#cd346f', false),
      ('Temporary',     '#95b229', true),
      ('Unique',        '#24705f', false),
      ('Vision',        '#707070', false),
      ('Weaponmaster',  '#707070', false)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS wish_lists CASCADE;
    DROP TABLE IF EXISTS wish_list_items CASCADE;
    DROP TABLE IF EXISTS verifications CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS user_preferences CASCADE;
    DROP TABLE IF EXISTS user_feature_flags CASCADE;
    DROP TABLE IF EXISTS trade_lists CASCADE;
    DROP TABLE IF EXISTS trade_list_items CASCADE;
    DROP TABLE IF EXISTS site_settings CASCADE;
    DROP TABLE IF EXISTS sets CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS provider_settings CASCADE;
    DROP TABLE IF EXISTS promo_types CASCADE;
    DROP TABLE IF EXISTS printings CASCADE;
    DROP TABLE IF EXISTS printing_link_overrides CASCADE;
    DROP TABLE IF EXISTS printing_images CASCADE;
    DROP TABLE IF EXISTS marketplace_staging_card_overrides CASCADE;
    DROP TABLE IF EXISTS marketplace_staging CASCADE;
    DROP TABLE IF EXISTS marketplace_snapshots CASCADE;
    DROP TABLE IF EXISTS marketplace_products CASCADE;
    DROP TABLE IF EXISTS marketplace_ignored_products CASCADE;
    DROP TABLE IF EXISTS marketplace_groups CASCADE;
    DROP TABLE IF EXISTS languages CASCADE;
    DROP TABLE IF EXISTS keyword_styles CASCADE;
    DROP TABLE IF EXISTS ignored_candidate_printings CASCADE;
    DROP TABLE IF EXISTS ignored_candidate_cards CASCADE;
    DROP TABLE IF EXISTS formats CASCADE;
    DROP TABLE IF EXISTS feature_flags CASCADE;
    DROP TABLE IF EXISTS decks CASCADE;
    DROP TABLE IF EXISTS deck_cards CASCADE;
    DROP TABLE IF EXISTS copies CASCADE;
    DROP TABLE IF EXISTS collections CASCADE;
    DROP TABLE IF EXISTS collection_events CASCADE;
    DROP TABLE IF EXISTS cards CASCADE;
    DROP TABLE IF EXISTS card_name_aliases CASCADE;
    DROP TABLE IF EXISTS card_bans CASCADE;
    DROP TABLE IF EXISTS candidate_printings CASCADE;
    DROP TABLE IF EXISTS candidate_cards CASCADE;
    DROP TABLE IF EXISTS admins CASCADE;
    DROP TABLE IF EXISTS acquisition_sources CASCADE;
    DROP TABLE IF EXISTS accounts CASCADE;

    DROP FUNCTION IF EXISTS candidate_cards_set_norm_name CASCADE;
    DROP FUNCTION IF EXISTS card_name_aliases_set_norm_name CASCADE;
    DROP FUNCTION IF EXISTS cards_set_norm_name CASCADE;
    DROP FUNCTION IF EXISTS prevent_nonempty_collection_delete CASCADE;
    DROP FUNCTION IF EXISTS set_updated_at CASCADE;
  `.execute(db);
}
