import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Add missing CHECK constraints across various tables.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── activity_items: enforce collection presence based on action ───────────
  await sql`
    ALTER TABLE activity_items
    ADD CONSTRAINT chk_activity_items_collection_presence CHECK (
      (action = 'added'   AND to_collection_id IS NOT NULL) OR
      (action = 'removed' AND from_collection_id IS NOT NULL) OR
      (action = 'moved'   AND from_collection_id IS NOT NULL AND to_collection_id IS NOT NULL)
    )
  `.execute(db);

  // ── card_name_aliases: cascade delete when card is removed ────────────────
  await sql`
    ALTER TABLE card_name_aliases
    DROP CONSTRAINT card_name_aliases_card_id_fkey,
    ADD CONSTRAINT card_name_aliases_card_id_fkey
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  `.execute(db);

  // ── cards: non-negative stat values ───────────────────────────────────────
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_might_non_negative CHECK (might >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_energy_non_negative CHECK (energy >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_power_non_negative CHECK (power >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_might_bonus_non_negative CHECK (might_bonus >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_name_not_empty CHECK (name <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE cards ADD CONSTRAINT chk_cards_slug_not_empty CHECK (slug <> '')`.execute(
    db,
  );

  // ── printings: positive collector_number ─────────────────────────────────
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_collector_number_positive CHECK (collector_number > 0)`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_art_variant CHECK (art_variant = ANY(ARRAY['normal', 'altart', 'overnumbered']))`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_artist_not_empty CHECK (artist <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_public_code_not_empty CHECK (public_code <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_slug_not_empty CHECK (slug <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_source_id_not_empty CHECK (source_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_no_empty_flavor_text CHECK (flavor_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printings ADD CONSTRAINT chk_printings_no_empty_comment CHECK (comment <> '')`.execute(
    db,
  );

  // ── printings: drop stale DEFAULT '' on flavor_text and printed_effect_text
  await sql`ALTER TABLE printings ALTER COLUMN flavor_text DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN printed_effect_text DROP DEFAULT`.execute(db);

  // ── printing_images ─────────────────────────────────────────────────────
  await sql`ALTER TABLE printing_images ADD CONSTRAINT chk_printing_images_face CHECK (face = ANY(ARRAY['front', 'back']))`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images ADD CONSTRAINT chk_printing_images_source_not_empty CHECK (source <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images ADD CONSTRAINT chk_printing_images_no_empty_original_url CHECK (original_url <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images ADD CONSTRAINT chk_printing_images_no_empty_rehosted_url CHECK (rehosted_url <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images ADD CONSTRAINT chk_printing_images_has_url CHECK (original_url IS NOT NULL OR rehosted_url IS NOT NULL)`.execute(
    db,
  );

  // ── sets ────────────────────────────────────────────────────────────────
  await sql`ALTER TABLE sets ADD CONSTRAINT chk_sets_name_not_empty CHECK (name <> '')`.execute(db);
  await sql`ALTER TABLE sets ADD CONSTRAINT chk_sets_slug_not_empty CHECK (slug <> '')`.execute(db);
  await sql`ALTER TABLE sets ALTER COLUMN printed_total DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE sets ADD CONSTRAINT chk_sets_printed_total_non_negative CHECK (printed_total >= 0)`.execute(
    db,
  );

  // ── card_sources ────────────────────────────────────────────────────────
  await sql`ALTER TABLE card_sources ALTER COLUMN type DROP NOT NULL`.execute(db);
  await sql`UPDATE card_sources SET type = NULL WHERE type = ''`.execute(db);
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_type CHECK (type <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_source_not_empty CHECK (source <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_source_id CHECK (source_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_source_entity_id CHECK (source_entity_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_name_not_empty CHECK (name <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_might_non_negative CHECK (might >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_energy_non_negative CHECK (energy >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_power_non_negative CHECK (power >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_might_bonus_non_negative CHECK (might_bonus >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources ADD CONSTRAINT chk_card_sources_no_empty_extra_data CHECK (extra_data <> '{}'::jsonb AND extra_data <> 'null'::jsonb)`.execute(
    db,
  );

  // ── printing_sources: make columns nullable ─────────────────────────────
  await sql`ALTER TABLE printing_sources ALTER COLUMN collector_number DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN public_code DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_signed DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_signed DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_promo DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_promo DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN rarity DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN finish DROP NOT NULL`.execute(db);

  // ── printing_sources: clean up empty strings → NULL ─────────────────────
  await sql`UPDATE printing_sources SET artist = NULL WHERE artist = ''`.execute(db);
  await sql`UPDATE printing_sources SET public_code = NULL WHERE public_code = ''`.execute(db);
  await sql`UPDATE printing_sources SET flavor_text = NULL WHERE flavor_text = ''`.execute(db);
  await sql`UPDATE printing_sources SET image_url = NULL WHERE image_url = ''`.execute(db);
  await sql`UPDATE printing_sources SET collector_number = NULL WHERE collector_number = 0`.execute(
    db,
  );
  await sql`UPDATE printing_sources SET rarity = NULL WHERE rarity = ''`.execute(db);
  await sql`UPDATE printing_sources SET art_variant = NULL WHERE art_variant = ''`.execute(db);

  // ── printing_sources: checks ────────────────────────────────────────────
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_source_id_not_empty CHECK (source_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_source_entity_id CHECK (source_entity_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_set_id CHECK (set_id <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_set_name CHECK (set_name <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_collector_number_positive CHECK (collector_number > 0)`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_artist CHECK (artist <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_public_code_not_empty CHECK (public_code <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_flavor_text CHECK (flavor_text <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_image_url CHECK (image_url <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_extra_data CHECK (extra_data <> '{}'::jsonb AND extra_data <> 'null'::jsonb)`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_art_variant CHECK (art_variant <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_finish CHECK (finish <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ADD CONSTRAINT chk_printing_sources_no_empty_rarity CHECK (rarity <> '')`.execute(
    db,
  );

  // ── marketplace_sources ─────────────────────────────────────────────────
  await sql`
    ALTER TABLE marketplace_sources
    ADD CONSTRAINT marketplace_sources_group_fkey
      FOREIGN KEY (marketplace, group_id) REFERENCES marketplace_groups(marketplace, group_id)
  `.execute(db);
  await sql`ALTER TABLE marketplace_sources ADD CONSTRAINT chk_marketplace_sources_marketplace_not_empty CHECK (marketplace <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources ADD CONSTRAINT chk_marketplace_sources_product_name_not_empty CHECK (product_name <> '')`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources ADD CONSTRAINT chk_marketplace_sources_external_id_positive CHECK (external_id > 0)`.execute(
    db,
  );

  // ── marketplace_snapshots: non-negative cents ─────────────────────────
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_market_cents_non_negative CHECK (market_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_low_cents_non_negative CHECK (low_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_mid_cents_non_negative CHECK (mid_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_high_cents_non_negative CHECK (high_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_trend_cents_non_negative CHECK (trend_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_avg1_cents_non_negative CHECK (avg1_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_avg7_cents_non_negative CHECK (avg7_cents >= 0)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots ADD CONSTRAINT chk_marketplace_snapshots_avg30_cents_non_negative CHECK (avg30_cents >= 0)`.execute(
    db,
  );

  // ── trade_list_items: add missing timestamps ──────────────────────────
  await sql`ALTER TABLE trade_list_items ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE trade_list_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );

  // ── wish_list_items: exactly one of card_id or printing_id must be set ─
  await sql`
    ALTER TABLE wish_list_items
    ADD CONSTRAINT chk_wish_list_items_target_xor
      CHECK ((card_id IS NOT NULL) != (printing_id IS NOT NULL))
  `.execute(db);

  // ── wish_list_items: add missing timestamps ───────────────────────────
  await sql`ALTER TABLE wish_list_items ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE wish_list_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );

  // ── decks: composite unique + non-empty name ──────────────────────────
  await sql`ALTER TABLE decks ADD CONSTRAINT uq_decks_id_user UNIQUE (id, user_id)`.execute(db);
  await sql`ALTER TABLE decks ADD CONSTRAINT chk_decks_name_not_empty CHECK (name <> '')`.execute(
    db,
  );

  // ── collections: non-empty name ───────────────────────────────────────
  await sql`ALTER TABLE collections ADD CONSTRAINT chk_collections_name_not_empty CHECK (name <> '')`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE collections DROP CONSTRAINT IF EXISTS chk_collections_name_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE decks DROP CONSTRAINT IF EXISTS chk_decks_name_not_empty`.execute(db);
  await sql`ALTER TABLE decks DROP CONSTRAINT IF EXISTS uq_decks_id_user`.execute(db);

  await sql`ALTER TABLE wish_list_items DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE wish_list_items DROP COLUMN created_at`.execute(db);
  await sql`ALTER TABLE wish_list_items DROP CONSTRAINT IF EXISTS chk_wish_list_items_target_xor`.execute(
    db,
  );

  await sql`ALTER TABLE trade_list_items DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE trade_list_items DROP COLUMN created_at`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_avg30_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_avg7_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_avg1_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_trend_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_high_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_mid_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_low_cents_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_market_cents_non_negative`.execute(
    db,
  );

  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT IF EXISTS chk_marketplace_sources_external_id_positive`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT IF EXISTS chk_marketplace_sources_product_name_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT IF EXISTS chk_marketplace_sources_marketplace_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT IF EXISTS marketplace_sources_group_fkey`.execute(
    db,
  );

  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_might_bonus_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_power_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_energy_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_might_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_name_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_no_empty_source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_no_empty_source_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_rarity`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_finish`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_art_variant`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_image_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_flavor_text`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_public_code_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_artist`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_collector_number_positive`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_set_name`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_set_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_no_empty_source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources DROP CONSTRAINT IF EXISTS chk_printing_sources_source_id_not_empty`.execute(
    db,
  );
  await sql`UPDATE printing_sources SET art_variant = '' WHERE art_variant IS NULL`.execute(db);
  await sql`UPDATE printing_sources SET rarity = '' WHERE rarity IS NULL`.execute(db);
  await sql`UPDATE printing_sources SET collector_number = 0 WHERE collector_number IS NULL`.execute(
    db,
  );
  await sql`UPDATE printing_sources SET public_code = '' WHERE public_code IS NULL`.execute(db);
  await sql`UPDATE printing_sources SET image_url = '' WHERE image_url IS NULL`.execute(db);
  await sql`UPDATE printing_sources SET flavor_text = '' WHERE flavor_text IS NULL`.execute(db);
  await sql`UPDATE printing_sources SET artist = '' WHERE artist IS NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN finish SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN rarity SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_promo SET DEFAULT false`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_promo SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_signed SET DEFAULT false`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN is_signed SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN public_code SET NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN collector_number SET NOT NULL`.execute(db);

  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_no_empty_type`.execute(
    db,
  );
  await sql`UPDATE card_sources SET type = '' WHERE type IS NULL`.execute(db);
  await sql`ALTER TABLE card_sources ALTER COLUMN type SET NOT NULL`.execute(db);
  await sql`ALTER TABLE card_sources DROP CONSTRAINT IF EXISTS chk_card_sources_source_not_empty`.execute(
    db,
  );

  await sql`ALTER TABLE sets DROP CONSTRAINT IF EXISTS chk_sets_printed_total_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE sets ALTER COLUMN printed_total SET NOT NULL`.execute(db);
  await sql`ALTER TABLE sets DROP CONSTRAINT IF EXISTS chk_sets_slug_not_empty`.execute(db);
  await sql`ALTER TABLE sets DROP CONSTRAINT IF EXISTS chk_sets_name_not_empty`.execute(db);

  await sql`ALTER TABLE printing_images DROP CONSTRAINT IF EXISTS chk_printing_images_has_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images DROP CONSTRAINT IF EXISTS chk_printing_images_no_empty_rehosted_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images DROP CONSTRAINT IF EXISTS chk_printing_images_no_empty_original_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images DROP CONSTRAINT IF EXISTS chk_printing_images_source_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images DROP CONSTRAINT IF EXISTS chk_printing_images_face`.execute(
    db,
  );

  await sql`ALTER TABLE printings ALTER COLUMN printed_effect_text SET DEFAULT ''`.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN flavor_text SET DEFAULT ''`.execute(db);
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_no_empty_comment`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_no_empty_flavor_text`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_source_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_slug_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_public_code_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_artist_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_art_variant`.execute(db);
  await sql`ALTER TABLE printings DROP CONSTRAINT IF EXISTS chk_printings_collector_number_positive`.execute(
    db,
  );
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_slug_not_empty`.execute(db);
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_name_not_empty`.execute(db);
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_might_bonus_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_power_non_negative`.execute(db);
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_energy_non_negative`.execute(db);
  await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_cards_might_non_negative`.execute(db);

  await sql`ALTER TABLE activity_items DROP CONSTRAINT IF EXISTS chk_activity_items_collection_presence`.execute(
    db,
  );

  await sql`
    ALTER TABLE card_name_aliases
    DROP CONSTRAINT card_name_aliases_card_id_fkey,
    ADD CONSTRAINT card_name_aliases_card_id_fkey
      FOREIGN KEY (card_id) REFERENCES cards(id)
  `.execute(db);
}
