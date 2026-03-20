import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Table renames ────────────────────────────────────────────────────────
  await sql`ALTER TABLE card_sources RENAME TO candidate_cards`.execute(db);
  await sql`ALTER TABLE printing_sources RENAME TO candidate_printings`.execute(db);
  await sql`ALTER TABLE ignored_card_sources RENAME TO ignored_candidate_cards`.execute(db);
  await sql`ALTER TABLE ignored_printing_sources RENAME TO ignored_candidate_printings`.execute(db);
  await sql`ALTER TABLE sources RENAME TO acquisition_sources`.execute(db);
  await sql`ALTER TABLE source_settings RENAME TO provider_settings`.execute(db);
  await sql`ALTER TABLE marketplace_sources RENAME TO marketplace_products`.execute(db);

  // ── Column renames: printings.source_id → short_code ─────────────────────
  await sql`ALTER TABLE printings RENAME COLUMN source_id TO short_code`.execute(db);

  // ── Column renames: candidate_cards (was card_sources) ───────────────────
  await sql`ALTER TABLE candidate_cards RENAME COLUMN source_id TO short_code`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME COLUMN source_entity_id TO external_id`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME COLUMN source TO provider`.execute(db);

  // ── Column renames: candidate_printings (was printing_sources) ───────────
  await sql`ALTER TABLE candidate_printings RENAME COLUMN source_id TO short_code`.execute(db);
  await sql`ALTER TABLE candidate_printings RENAME COLUMN card_source_id TO candidate_card_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME COLUMN source_entity_id TO external_id`.execute(
    db,
  );

  // ── Column renames: ignored_candidate_cards (was ignored_card_sources) ───
  await sql`ALTER TABLE ignored_candidate_cards RENAME COLUMN source_entity_id TO external_id`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_cards RENAME COLUMN source TO provider`.execute(db);

  // ── Column renames: ignored_candidate_printings (was ignored_printing_sources) ──
  await sql`ALTER TABLE ignored_candidate_printings RENAME COLUMN source_entity_id TO external_id`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_printings RENAME COLUMN source TO provider`.execute(db);

  // ── Column renames: printing_link_overrides ──────────────────────────────
  await sql`ALTER TABLE printing_link_overrides RENAME COLUMN source_entity_id TO external_id`.execute(
    db,
  );

  // ── Column renames: provider_settings (was source_settings) ──────────────
  await sql`ALTER TABLE provider_settings RENAME COLUMN source TO provider`.execute(db);

  // ── Column renames: printing_images ──────────────────────────────────────
  await sql`ALTER TABLE printing_images RENAME COLUMN source TO provider`.execute(db);

  // ── Column renames: copies.source_id → acquisition_source_id ─────────────
  await sql`ALTER TABLE copies RENAME COLUMN source_id TO acquisition_source_id`.execute(db);

  // ── Column renames: marketplace_snapshots.source_id → product_id ─────────
  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN source_id TO product_id`.execute(db);

  // ── Rename trigger functions to match new table names ────────────────────
  await sql`ALTER FUNCTION card_sources_set_norm_name() RENAME TO candidate_cards_set_norm_name`.execute(
    db,
  );
  await sql`ALTER FUNCTION printing_sources_set_group_key() RENAME TO candidate_printings_set_group_key`.execute(
    db,
  );

  // ── Rename triggers ─────────────────────────────────────────────────────
  await sql`ALTER TRIGGER trg_card_sources_norm_name ON candidate_cards RENAME TO trg_candidate_cards_norm_name`.execute(
    db,
  );
  await sql`ALTER TRIGGER trg_printing_sources_group_key ON candidate_printings RENAME TO trg_candidate_printings_group_key`.execute(
    db,
  );

  // ── Rename constraints: candidate_cards ──────────────────────────────────
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_might_non_negative TO chk_candidate_cards_might_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_energy_non_negative TO chk_candidate_cards_energy_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_power_non_negative TO chk_candidate_cards_power_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_might_bonus_non_negative TO chk_candidate_cards_might_bonus_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_name_not_empty TO chk_candidate_cards_name_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_type TO chk_candidate_cards_no_empty_type`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_rules_text TO chk_candidate_cards_no_empty_rules_text`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_effect_text TO chk_candidate_cards_no_empty_effect_text`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_source_entity_id TO chk_candidate_cards_no_empty_external_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_source_id TO chk_candidate_cards_no_empty_short_code`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_source_not_empty TO chk_candidate_cards_provider_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT chk_card_sources_no_empty_extra_data TO chk_candidate_cards_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_cards RENAME CONSTRAINT card_sources_pkey TO candidate_cards_pkey`.execute(
    db,
  );

  // ── Rename constraints: candidate_printings ──────────────────────────────
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_collector_number_positive TO chk_candidate_printings_collector_number_positive`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_set_id TO chk_candidate_printings_no_empty_set_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_set_name TO chk_candidate_printings_no_empty_set_name`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_rarity TO chk_candidate_printings_no_empty_rarity`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_art_variant TO chk_candidate_printings_no_empty_art_variant`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_finish TO chk_candidate_printings_no_empty_finish`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_artist TO chk_candidate_printings_no_empty_artist`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_public_code_not_empty TO chk_candidate_printings_public_code_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_printed_rules_text TO chk_candidate_printings_no_empty_printed_rules_text`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_printed_effect_text TO chk_candidate_printings_no_empty_printed_effect_text`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_image_url TO chk_candidate_printings_no_empty_image_url`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_flavor_text TO chk_candidate_printings_no_empty_flavor_text`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_source_entity_id TO chk_candidate_printings_no_empty_external_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_source_id_not_empty TO chk_candidate_printings_short_code_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT chk_printing_sources_no_empty_extra_data TO chk_candidate_printings_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT printing_sources_pkey TO candidate_printings_pkey`.execute(
    db,
  );

  // ── Rename constraints: ignored tables ───────────────────────────────────
  await sql`ALTER TABLE ignored_candidate_cards RENAME CONSTRAINT chk_ignored_card_sources_entity_id_not_empty TO chk_ignored_candidate_cards_external_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_cards RENAME CONSTRAINT chk_ignored_card_sources_source_not_empty TO chk_ignored_candidate_cards_provider_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_cards RENAME CONSTRAINT ignored_card_sources_pkey TO ignored_candidate_cards_pkey`.execute(
    db,
  );

  await sql`ALTER TABLE ignored_candidate_printings RENAME CONSTRAINT chk_ignored_printing_sources_entity_id_not_empty TO chk_ignored_candidate_printings_external_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_printings RENAME CONSTRAINT chk_ignored_printing_sources_source_not_empty TO chk_ignored_candidate_printings_provider_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_printings RENAME CONSTRAINT chk_ignored_printing_sources_no_empty_finish TO chk_ignored_candidate_printings_no_empty_finish`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_printings RENAME CONSTRAINT ignored_printing_sources_pkey TO ignored_candidate_printings_pkey`.execute(
    db,
  );

  // ── Rename constraints: provider_settings ────────────────────────────────
  await sql`ALTER TABLE provider_settings RENAME CONSTRAINT source_settings_source_check TO provider_settings_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE provider_settings RENAME CONSTRAINT source_settings_pkey TO provider_settings_pkey`.execute(
    db,
  );

  // ── Rename constraints: printing_images ──────────────────────────────────
  await sql`ALTER TABLE printing_images RENAME CONSTRAINT chk_printing_images_source_not_empty TO chk_printing_images_provider_not_empty`.execute(
    db,
  );

  // ── Rename constraints: printings ────────────────────────────────────────
  await sql`ALTER TABLE printings RENAME CONSTRAINT chk_printings_source_id_not_empty TO chk_printings_short_code_not_empty`.execute(
    db,
  );

  // ── Rename constraints: printing_link_overrides ──────────────────────────
  await sql`ALTER TABLE printing_link_overrides RENAME CONSTRAINT chk_plo_no_empty_source_entity_id TO chk_plo_no_empty_external_id`.execute(
    db,
  );

  // ── Rename constraints: marketplace_products ─────────────────────────────
  await sql`ALTER TABLE marketplace_products RENAME CONSTRAINT marketplace_sources_new_id_not_null TO marketplace_products_id_not_null`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_products RENAME CONSTRAINT marketplace_sources_new_printing_id_not_null TO marketplace_products_printing_id_not_null`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_products RENAME CONSTRAINT chk_marketplace_sources_external_id_positive TO chk_marketplace_products_external_id_positive`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_products RENAME CONSTRAINT chk_marketplace_sources_marketplace_not_empty TO chk_marketplace_products_marketplace_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_products RENAME CONSTRAINT chk_marketplace_sources_product_name_not_empty TO chk_marketplace_products_product_name_not_empty`.execute(
    db,
  );

  // ── Rename constraints: marketplace_snapshots ────────────────────────────
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_source_id_recorded_at_key TO marketplace_snapshots_product_id_recorded_at_key`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_source_id_fkey TO marketplace_snapshots_product_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_new_source_id_not_null TO marketplace_snapshots_product_id_not_null`.execute(
    db,
  );

  // ── Rename constraints: copies ───────────────────────────────────────────
  await sql`ALTER TABLE copies RENAME CONSTRAINT fk_copies_source_user TO fk_copies_acquisition_source_user`.execute(
    db,
  );

  // ── Rename FK: candidate_printings → candidate_cards ─────────────────────
  await sql`ALTER TABLE candidate_printings RENAME CONSTRAINT printing_sources_card_source_id_fkey TO candidate_printings_candidate_card_id_fkey`.execute(
    db,
  );

  // ── Rename indexes ──────────────────────────────────────────────────────
  await sql`ALTER INDEX idx_card_sources_norm_name RENAME TO idx_candidate_cards_norm_name`.execute(
    db,
  );
  await sql`ALTER INDEX idx_card_sources_source_name_no_sid RENAME TO idx_candidate_cards_provider_name_no_sid`.execute(
    db,
  );
  await sql`ALTER INDEX idx_card_sources_source_source_id RENAME TO idx_candidate_cards_provider_short_code`.execute(
    db,
  );
  await sql`ALTER INDEX idx_card_sources_unchecked RENAME TO idx_candidate_cards_unchecked`.execute(
    db,
  );
  await sql`ALTER INDEX idx_printing_sources_card_source RENAME TO idx_candidate_printings_candidate_card`.execute(
    db,
  );
  await sql`ALTER INDEX idx_printing_sources_card_source_printing RENAME TO idx_candidate_printings_candidate_card_printing`.execute(
    db,
  );
  await sql`ALTER INDEX idx_printing_sources_group_key RENAME TO idx_candidate_printings_group_key`.execute(
    db,
  );
  await sql`ALTER INDEX idx_ignored_card_sources_source_entity RENAME TO idx_ignored_candidate_cards_provider_external`.execute(
    db,
  );
  await sql`ALTER INDEX idx_ignored_printing_sources_source_entity_finish RENAME TO idx_ignored_candidate_printings_provider_external_finish`.execute(
    db,
  );
  await sql`ALTER INDEX idx_printing_images_source RENAME TO idx_printing_images_provider`.execute(
    db,
  );
  await sql`ALTER INDEX idx_copies_source RENAME TO idx_copies_acquisition_source`.execute(db);
  await sql`ALTER INDEX idx_marketplace_snapshots_source_id_recorded_at RENAME TO idx_marketplace_snapshots_product_id_recorded_at`.execute(
    db,
  );
  await sql`ALTER INDEX idx_sources_user_id RENAME TO idx_acquisition_sources_user_id`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse all renames in opposite order

  // ── Reverse column renames ──────────────────────────────────────────────
  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN product_id TO source_id`.execute(db);
  await sql`ALTER TABLE copies RENAME COLUMN acquisition_source_id TO source_id`.execute(db);
  await sql`ALTER TABLE printing_images RENAME COLUMN provider TO source`.execute(db);
  await sql`ALTER TABLE provider_settings RENAME COLUMN provider TO source`.execute(db);
  await sql`ALTER TABLE printing_link_overrides RENAME COLUMN external_id TO source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_printings RENAME COLUMN provider TO source`.execute(db);
  await sql`ALTER TABLE ignored_candidate_printings RENAME COLUMN external_id TO source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_candidate_cards RENAME COLUMN provider TO source`.execute(db);
  await sql`ALTER TABLE ignored_candidate_cards RENAME COLUMN external_id TO source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME COLUMN external_id TO source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME COLUMN candidate_card_id TO card_source_id`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings RENAME COLUMN short_code TO source_id`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME COLUMN provider TO source`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME COLUMN external_id TO source_entity_id`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME COLUMN short_code TO source_id`.execute(db);
  await sql`ALTER TABLE printings RENAME COLUMN short_code TO source_id`.execute(db);

  // ── Reverse table renames ───────────────────────────────────────────────
  await sql`ALTER TABLE marketplace_products RENAME TO marketplace_sources`.execute(db);
  await sql`ALTER TABLE provider_settings RENAME TO source_settings`.execute(db);
  await sql`ALTER TABLE acquisition_sources RENAME TO sources`.execute(db);
  await sql`ALTER TABLE ignored_candidate_printings RENAME TO ignored_printing_sources`.execute(db);
  await sql`ALTER TABLE ignored_candidate_cards RENAME TO ignored_card_sources`.execute(db);
  await sql`ALTER TABLE candidate_printings RENAME TO printing_sources`.execute(db);
  await sql`ALTER TABLE candidate_cards RENAME TO card_sources`.execute(db);

  // ── Reverse trigger function renames ─────────────────────────────────────
  await sql`ALTER FUNCTION candidate_cards_set_norm_name() RENAME TO card_sources_set_norm_name`.execute(
    db,
  );
  await sql`ALTER FUNCTION candidate_printings_set_group_key() RENAME TO printing_sources_set_group_key`.execute(
    db,
  );

  // ── Reverse trigger renames ──────────────────────────────────────────────
  await sql`ALTER TRIGGER trg_candidate_cards_norm_name ON card_sources RENAME TO trg_card_sources_norm_name`.execute(
    db,
  );
  await sql`ALTER TRIGGER trg_candidate_printings_group_key ON printing_sources RENAME TO trg_printing_sources_group_key`.execute(
    db,
  );

  // ── Reverse constraint renames: card_sources (was candidate_cards) ───────
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_might_non_negative TO chk_card_sources_might_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_energy_non_negative TO chk_card_sources_energy_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_power_non_negative TO chk_card_sources_power_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_might_bonus_non_negative TO chk_card_sources_might_bonus_non_negative`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_name_not_empty TO chk_card_sources_name_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_type TO chk_card_sources_no_empty_type`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_rules_text TO chk_card_sources_no_empty_rules_text`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_effect_text TO chk_card_sources_no_empty_effect_text`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_external_id TO chk_card_sources_no_empty_source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_short_code TO chk_card_sources_no_empty_source_id`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_provider_not_empty TO chk_card_sources_source_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT chk_candidate_cards_no_empty_extra_data TO chk_card_sources_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE card_sources RENAME CONSTRAINT candidate_cards_pkey TO card_sources_pkey`.execute(
    db,
  );

  // ── Reverse constraint renames: printing_sources (was candidate_printings) ─
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_collector_number_positive TO chk_printing_sources_collector_number_positive`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_set_id TO chk_printing_sources_no_empty_set_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_set_name TO chk_printing_sources_no_empty_set_name`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_rarity TO chk_printing_sources_no_empty_rarity`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_art_variant TO chk_printing_sources_no_empty_art_variant`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_finish TO chk_printing_sources_no_empty_finish`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_artist TO chk_printing_sources_no_empty_artist`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_public_code_not_empty TO chk_printing_sources_public_code_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_printed_rules_text TO chk_printing_sources_no_empty_printed_rules_text`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_printed_effect_text TO chk_printing_sources_no_empty_printed_effect_text`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_image_url TO chk_printing_sources_no_empty_image_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_flavor_text TO chk_printing_sources_no_empty_flavor_text`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_external_id TO chk_printing_sources_no_empty_source_entity_id`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_short_code_not_empty TO chk_printing_sources_source_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT chk_candidate_printings_no_empty_extra_data TO chk_printing_sources_no_empty_extra_data`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT candidate_printings_pkey TO printing_sources_pkey`.execute(
    db,
  );

  // ── Reverse constraint renames: ignored tables ─────────────────────────────
  await sql`ALTER TABLE ignored_card_sources RENAME CONSTRAINT chk_ignored_candidate_cards_external_id_not_empty TO chk_ignored_card_sources_entity_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_card_sources RENAME CONSTRAINT chk_ignored_candidate_cards_provider_not_empty TO chk_ignored_card_sources_source_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_card_sources RENAME CONSTRAINT ignored_candidate_cards_pkey TO ignored_card_sources_pkey`.execute(
    db,
  );

  await sql`ALTER TABLE ignored_printing_sources RENAME CONSTRAINT chk_ignored_candidate_printings_external_id_not_empty TO chk_ignored_printing_sources_entity_id_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_printing_sources RENAME CONSTRAINT chk_ignored_candidate_printings_provider_not_empty TO chk_ignored_printing_sources_source_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_printing_sources RENAME CONSTRAINT chk_ignored_candidate_printings_no_empty_finish TO chk_ignored_printing_sources_no_empty_finish`.execute(
    db,
  );
  await sql`ALTER TABLE ignored_printing_sources RENAME CONSTRAINT ignored_candidate_printings_pkey TO ignored_printing_sources_pkey`.execute(
    db,
  );

  // ── Reverse constraint renames: provider_settings → source_settings ────────
  await sql`ALTER TABLE source_settings RENAME CONSTRAINT provider_settings_provider_check TO source_settings_source_check`.execute(
    db,
  );
  await sql`ALTER TABLE source_settings RENAME CONSTRAINT provider_settings_pkey TO source_settings_pkey`.execute(
    db,
  );

  // ── Reverse constraint renames: printing_images ────────────────────────────
  await sql`ALTER TABLE printing_images RENAME CONSTRAINT chk_printing_images_provider_not_empty TO chk_printing_images_source_not_empty`.execute(
    db,
  );

  // ── Reverse constraint renames: printings ──────────────────────────────────
  await sql`ALTER TABLE printings RENAME CONSTRAINT chk_printings_short_code_not_empty TO chk_printings_source_id_not_empty`.execute(
    db,
  );

  // ── Reverse constraint renames: printing_link_overrides ────────────────────
  await sql`ALTER TABLE printing_link_overrides RENAME CONSTRAINT chk_plo_no_empty_external_id TO chk_plo_no_empty_source_entity_id`.execute(
    db,
  );

  // ── Reverse constraint renames: marketplace_products → marketplace_sources ─
  await sql`ALTER TABLE marketplace_sources RENAME CONSTRAINT marketplace_products_id_not_null TO marketplace_sources_new_id_not_null`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources RENAME CONSTRAINT marketplace_products_printing_id_not_null TO marketplace_sources_new_printing_id_not_null`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources RENAME CONSTRAINT chk_marketplace_products_external_id_positive TO chk_marketplace_sources_external_id_positive`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources RENAME CONSTRAINT chk_marketplace_products_marketplace_not_empty TO chk_marketplace_sources_marketplace_not_empty`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources RENAME CONSTRAINT chk_marketplace_products_product_name_not_empty TO chk_marketplace_sources_product_name_not_empty`.execute(
    db,
  );

  // ── Reverse constraint renames: marketplace_snapshots ──────────────────────
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_product_id_recorded_at_key TO marketplace_snapshots_source_id_recorded_at_key`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_product_id_fkey TO marketplace_snapshots_source_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots RENAME CONSTRAINT marketplace_snapshots_product_id_not_null TO marketplace_snapshots_new_source_id_not_null`.execute(
    db,
  );

  // ── Reverse constraint renames: copies ─────────────────────────────────────
  await sql`ALTER TABLE copies RENAME CONSTRAINT fk_copies_acquisition_source_user TO fk_copies_source_user`.execute(
    db,
  );

  // ── Reverse FK rename: candidate_printings → printing_sources ──────────────
  await sql`ALTER TABLE printing_sources RENAME CONSTRAINT candidate_printings_candidate_card_id_fkey TO printing_sources_card_source_id_fkey`.execute(
    db,
  );

  // ── Reverse index renames ─────────────────────────────────────────────────
  await sql`ALTER INDEX idx_candidate_cards_norm_name RENAME TO idx_card_sources_norm_name`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_cards_provider_name_no_sid RENAME TO idx_card_sources_source_name_no_sid`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_cards_provider_short_code RENAME TO idx_card_sources_source_source_id`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_cards_unchecked RENAME TO idx_card_sources_unchecked`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_printings_candidate_card RENAME TO idx_printing_sources_card_source`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_printings_candidate_card_printing RENAME TO idx_printing_sources_card_source_printing`.execute(
    db,
  );
  await sql`ALTER INDEX idx_candidate_printings_group_key RENAME TO idx_printing_sources_group_key`.execute(
    db,
  );
  await sql`ALTER INDEX idx_ignored_candidate_cards_provider_external RENAME TO idx_ignored_card_sources_source_entity`.execute(
    db,
  );
  await sql`ALTER INDEX idx_ignored_candidate_printings_provider_external_finish RENAME TO idx_ignored_printing_sources_source_entity_finish`.execute(
    db,
  );
  await sql`ALTER INDEX idx_printing_images_provider RENAME TO idx_printing_images_source`.execute(
    db,
  );
  await sql`ALTER INDEX idx_copies_acquisition_source RENAME TO idx_copies_source`.execute(db);
  await sql`ALTER INDEX idx_marketplace_snapshots_product_id_recorded_at RENAME TO idx_marketplace_snapshots_source_id_recorded_at`.execute(
    db,
  );
  await sql`ALTER INDEX idx_acquisition_sources_user_id RENAME TO idx_sources_user_id`.execute(db);
}
