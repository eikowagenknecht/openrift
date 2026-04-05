import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Create reference tables ──────────────────────────────────────────────

  await sql`
    CREATE TABLE card_types (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE rarities (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE domains (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE super_types (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE finishes (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE art_variants (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE deck_formats (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE deck_zones (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    )
  `.execute(db);

  // ── 2. Seed reference tables ────────────────────────────────────────────────

  await sql`
    INSERT INTO card_types (slug, label, sort_order, is_well_known) VALUES
      ('Legend',      'Legend',      0, TRUE),
      ('Unit',        'Unit',        1, FALSE),
      ('Rune',        'Rune',        2, TRUE),
      ('Spell',       'Spell',       3, FALSE),
      ('Gear',        'Gear',        4, FALSE),
      ('Battlefield', 'Battlefield', 5, TRUE),
      ('Other',       'Other',       6, FALSE);

    INSERT INTO rarities (slug, label, sort_order, is_well_known) VALUES
      ('Common',   'Common',   0, FALSE),
      ('Uncommon', 'Uncommon', 1, FALSE),
      ('Rare',     'Rare',     2, FALSE),
      ('Epic',     'Epic',     3, FALSE),
      ('Showcase', 'Showcase', 4, FALSE);

    INSERT INTO domains (slug, label, sort_order, is_well_known) VALUES
      ('Fury',      'Fury',      0, FALSE),
      ('Calm',      'Calm',      1, FALSE),
      ('Mind',      'Mind',      2, FALSE),
      ('Body',      'Body',      3, FALSE),
      ('Chaos',     'Chaos',     4, FALSE),
      ('Order',     'Order',     5, FALSE),
      ('Colorless', 'Colorless', 6, TRUE);

    INSERT INTO super_types (slug, label, sort_order, is_well_known) VALUES
      ('Basic',     'Basic',     0, FALSE),
      ('Champion',  'Champion',  1, TRUE),
      ('Signature', 'Signature', 2, TRUE),
      ('Token',     'Token',     3, FALSE);

    INSERT INTO finishes (slug, label, sort_order, is_well_known) VALUES
      ('normal', 'Normal', 0, TRUE),
      ('foil',   'Foil',   1, TRUE);

    INSERT INTO art_variants (slug, label, sort_order, is_well_known) VALUES
      ('normal',       'Normal',       0, TRUE),
      ('altart',       'Alt Art',      1, FALSE),
      ('overnumbered', 'Overnumbered', 2, FALSE);

    INSERT INTO deck_formats (slug, label, sort_order, is_well_known) VALUES
      ('standard', 'Standard', 0, TRUE),
      ('freeform', 'Freeform', 1, TRUE);

    INSERT INTO deck_zones (slug, label, sort_order, is_well_known) VALUES
      ('main',        'Main',        0, TRUE),
      ('sideboard',   'Sideboard',   1, FALSE),
      ('legend',      'Legend',      2, TRUE),
      ('champion',    'Champion',    3, TRUE),
      ('runes',       'Runes',       4, TRUE),
      ('battlefield', 'Battlefield', 5, TRUE),
      ('overflow',    'Overflow',    6, TRUE)
  `.execute(db);

  // ── 3. Create junction tables ───────────────────────────────────────────────

  await sql`
    CREATE TABLE card_domains (
      card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      domain_slug  TEXT NOT NULL REFERENCES domains(slug),
      ordinal      SMALLINT NOT NULL CHECK (ordinal >= 0),
      PRIMARY KEY (card_id, domain_slug),
      UNIQUE (card_id, ordinal)
    );

    CREATE TABLE card_super_types (
      card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      super_type_slug TEXT NOT NULL REFERENCES super_types(slug),
      PRIMARY KEY (card_id, super_type_slug)
    )
  `.execute(db);

  // ── 4. Backfill junction tables from array columns ──────────────────────────

  await sql`
    INSERT INTO card_domains (card_id, domain_slug, ordinal)
    SELECT id, val, ord::smallint - 1
    FROM cards, unnest(domains) WITH ORDINALITY AS t(val, ord);

    INSERT INTO card_super_types (card_id, super_type_slug)
    SELECT DISTINCT id, val
    FROM cards, unnest(super_types) WITH ORDINALITY AS t(val, ord)
  `.execute(db);

  // ── 5. Add foreign keys from existing columns to reference tables ───────────

  await sql`
    ALTER TABLE cards
      ADD CONSTRAINT fk_cards_type FOREIGN KEY (type) REFERENCES card_types(slug);

    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_rarity FOREIGN KEY (rarity) REFERENCES rarities(slug);

    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_finish FOREIGN KEY (finish) REFERENCES finishes(slug);

    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_art_variant FOREIGN KEY (art_variant) REFERENCES art_variants(slug);

    ALTER TABLE decks
      ADD CONSTRAINT fk_decks_format FOREIGN KEY (format) REFERENCES deck_formats(slug);

    ALTER TABLE deck_cards
      ADD CONSTRAINT fk_deck_cards_zone FOREIGN KEY (zone) REFERENCES deck_zones(slug)
  `.execute(db);

  // ── 6. Drop replaced CHECK constraints ──────────────────────────────────────

  await sql`
    ALTER TABLE cards
      DROP CONSTRAINT chk_cards_type,
      DROP CONSTRAINT chk_cards_domains_values,
      DROP CONSTRAINT chk_cards_domains_not_empty,
      DROP CONSTRAINT chk_cards_super_types_values;

    ALTER TABLE printings
      DROP CONSTRAINT chk_printings_rarity,
      DROP CONSTRAINT chk_printings_finish,
      DROP CONSTRAINT chk_printings_art_variant;

    ALTER TABLE decks
      DROP CONSTRAINT chk_decks_format;

    ALTER TABLE deck_cards
      DROP CONSTRAINT chk_deck_cards_zone
  `.execute(db);

  // ── 7. Drop array columns (data now in junction tables) ─────────────────────

  await sql`
    ALTER TABLE cards
      DROP COLUMN domains,
      DROP COLUMN super_types
  `.execute(db);

  // ── 8. Add protect_well_known trigger ───────────────────────────────────────

  await sql`
    CREATE FUNCTION protect_well_known() RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known row "%"', OLD.slug;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.slug != OLD.slug THEN
          RAISE EXCEPTION 'Cannot rename well-known row "%"', OLD.slug;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known row "%"', OLD.slug;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_card_types_protect_well_known
      BEFORE UPDATE OR DELETE ON card_types
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_rarities_protect_well_known
      BEFORE UPDATE OR DELETE ON rarities
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_domains_protect_well_known
      BEFORE UPDATE OR DELETE ON domains
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_super_types_protect_well_known
      BEFORE UPDATE OR DELETE ON super_types
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_finishes_protect_well_known
      BEFORE UPDATE OR DELETE ON finishes
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_art_variants_protect_well_known
      BEFORE UPDATE OR DELETE ON art_variants
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_deck_formats_protect_well_known
      BEFORE UPDATE OR DELETE ON deck_formats
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_deck_zones_protect_well_known
      BEFORE UPDATE OR DELETE ON deck_zones
      FOR EACH ROW EXECUTE FUNCTION protect_well_known()
  `.execute(db);

  // ── 9. Add index on card_domains for domain-based lookups ───────────────────

  await sql`
    CREATE INDEX idx_card_domains_domain_slug ON card_domains (domain_slug)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add array columns
  await sql`
    ALTER TABLE cards
      ADD COLUMN domains TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN super_types TEXT[] NOT NULL DEFAULT '{}'
  `.execute(db);

  // Backfill arrays from junction tables
  await sql`
    UPDATE cards SET domains = (
      SELECT COALESCE(array_agg(cd.domain_slug ORDER BY cd.ordinal), '{}')
      FROM card_domains cd WHERE cd.card_id = cards.id
    );
    UPDATE cards SET super_types = (
      SELECT COALESCE(array_agg(cst.super_type_slug), '{}')
      FROM card_super_types cst WHERE cst.card_id = cards.id
    )
  `.execute(db);

  // Re-add CHECK constraints
  await sql`
    ALTER TABLE cards
      ADD CONSTRAINT chk_cards_type CHECK (type = ANY(ARRAY['Legend','Unit','Rune','Spell','Gear','Battlefield','Other'])),
      ADD CONSTRAINT chk_cards_domains_values CHECK (domains <@ ARRAY['Fury','Calm','Mind','Body','Chaos','Order','Colorless']::text[]),
      ADD CONSTRAINT chk_cards_domains_not_empty CHECK (array_length(domains, 1) > 0),
      ADD CONSTRAINT chk_cards_super_types_values CHECK (super_types <@ ARRAY['Basic','Champion','Signature','Token']::text[]);

    ALTER TABLE printings
      ADD CONSTRAINT chk_printings_rarity CHECK (rarity = ANY(ARRAY['Common','Uncommon','Rare','Epic','Showcase'])),
      ADD CONSTRAINT chk_printings_finish CHECK (finish = ANY(ARRAY['normal','foil'])),
      ADD CONSTRAINT chk_printings_art_variant CHECK (art_variant = ANY(ARRAY['normal','altart','overnumbered']));

    ALTER TABLE decks
      ADD CONSTRAINT chk_decks_format CHECK (format IN ('standard','freeform'));

    ALTER TABLE deck_cards
      ADD CONSTRAINT chk_deck_cards_zone CHECK (zone = ANY(ARRAY['main','sideboard','legend','champion','runes','battlefield','overflow']))
  `.execute(db);

  // Drop FKs
  await sql`
    ALTER TABLE cards DROP CONSTRAINT fk_cards_type;
    ALTER TABLE printings DROP CONSTRAINT fk_printings_rarity;
    ALTER TABLE printings DROP CONSTRAINT fk_printings_finish;
    ALTER TABLE printings DROP CONSTRAINT fk_printings_art_variant;
    ALTER TABLE decks DROP CONSTRAINT fk_decks_format;
    ALTER TABLE deck_cards DROP CONSTRAINT fk_deck_cards_zone
  `.execute(db);

  // Drop triggers and function
  await sql`
    DROP TRIGGER trg_card_types_protect_well_known ON card_types;
    DROP TRIGGER trg_rarities_protect_well_known ON rarities;
    DROP TRIGGER trg_domains_protect_well_known ON domains;
    DROP TRIGGER trg_super_types_protect_well_known ON super_types;
    DROP TRIGGER trg_finishes_protect_well_known ON finishes;
    DROP TRIGGER trg_art_variants_protect_well_known ON art_variants;
    DROP TRIGGER trg_deck_formats_protect_well_known ON deck_formats;
    DROP TRIGGER trg_deck_zones_protect_well_known ON deck_zones;
    DROP FUNCTION protect_well_known
  `.execute(db);

  // Drop junction tables
  await sql`
    DROP TABLE card_super_types;
    DROP TABLE card_domains
  `.execute(db);

  // Drop reference tables
  await sql`
    DROP TABLE deck_zones;
    DROP TABLE deck_formats;
    DROP TABLE art_variants;
    DROP TABLE finishes;
    DROP TABLE super_types;
    DROP TABLE domains;
    DROP TABLE rarities;
    DROP TABLE card_types
  `.execute(db);
}
