import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Sets ──────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE sets (
      id            text PRIMARY KEY,
      name          text NOT NULL,
      printed_total integer NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // ── Cards ─────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE cards (
      id            text PRIMARY KEY,
      name          text NOT NULL,
      type          text NOT NULL,
      super_types   text[] NOT NULL DEFAULT '{}',
      domains       text[] NOT NULL,
      might         integer,
      energy        integer,
      power         integer,
      might_bonus   integer,
      keywords      text[] NOT NULL DEFAULT '{}',
      rules_text    text NOT NULL,
      effect_text   text NOT NULL DEFAULT '',
      tags          text[] NOT NULL DEFAULT '{}',
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_cards_type CHECK (type IN ('Legend', 'Unit', 'Rune', 'Spell', 'Gear', 'Battlefield'))
    )
  `.execute(db);

  // ── Printings ─────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE printings (
      id                   text PRIMARY KEY,
      card_id              text NOT NULL REFERENCES cards(id),
      set_id               text NOT NULL REFERENCES sets(id),
      source_id            text NOT NULL,
      collector_number     integer NOT NULL,
      rarity               text NOT NULL,
      art_variant          text NOT NULL,
      is_signed            boolean NOT NULL DEFAULT false,
      is_promo             boolean NOT NULL DEFAULT false,
      finish               text NOT NULL,
      image_url            text NOT NULL,
      artist               text NOT NULL,
      public_code          text NOT NULL,
      printed_rules_text   text NOT NULL,
      printed_effect_text  text NOT NULL DEFAULT '',
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_printings_variant UNIQUE (source_id, art_variant, is_signed, is_promo, finish),
      CONSTRAINT chk_printings_rarity CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')),
      CONSTRAINT chk_printings_finish CHECK (finish IN ('normal', 'foil'))
    )
  `.execute(db);

  // ── Indexes ───────────────────────────────────────────────────────────────
  await sql`CREATE INDEX idx_printings_card_id ON printings(card_id)`.execute(db);
  await sql`CREATE INDEX idx_printings_set_id ON printings(set_id)`.execute(db);
  await sql`CREATE INDEX idx_printings_rarity ON printings(rarity)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE printings`.execute(db);
  await sql`DROP TABLE cards`.execute(db);
  await sql`DROP TABLE sets`.execute(db);
}
