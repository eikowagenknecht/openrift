import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE candidate_cards (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status          text NOT NULL DEFAULT 'pending',
      source          text NOT NULL DEFAULT '',
      match_card_id   text REFERENCES cards(id),
      -- card fields (same as cards table)
      source_id       text NOT NULL,
      name            text NOT NULL,
      type            text NOT NULL,
      super_types     text[] NOT NULL DEFAULT '{}',
      domains         text[] NOT NULL,
      might           integer,
      energy          integer,
      power           integer,
      might_bonus     integer,
      keywords        text[] NOT NULL DEFAULT '{}',
      rules_text      text NOT NULL,
      effect_text     text NOT NULL DEFAULT '',
      tags            text[] NOT NULL DEFAULT '{}',
      -- review metadata
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      reviewed_at     timestamptz,
      reviewed_by     text REFERENCES users(id),
      CONSTRAINT chk_candidate_cards_status CHECK (status IN ('pending', 'accepted', 'rejected')),
      CONSTRAINT chk_candidate_cards_type CHECK (type IN ('Legend', 'Unit', 'Rune', 'Spell', 'Gear', 'Battlefield'))
    )
  `.execute(db);

  await sql`CREATE INDEX idx_candidate_cards_status ON candidate_cards(status)`.execute(db);
  await sql`CREATE INDEX idx_candidate_cards_match ON candidate_cards(match_card_id)`.execute(db);

  await sql`
    CREATE TABLE candidate_printings (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_card_id    uuid NOT NULL REFERENCES candidate_cards(id) ON DELETE CASCADE,
      -- printing fields (same as printings table)
      source_id            text NOT NULL,
      set_id               text NOT NULL,
      set_name             text,
      collector_number     integer NOT NULL,
      rarity               text NOT NULL,
      art_variant          text NOT NULL,
      is_signed            boolean NOT NULL DEFAULT false,
      is_promo             boolean NOT NULL DEFAULT false,
      finish               text NOT NULL,
      artist               text NOT NULL,
      public_code          text NOT NULL,
      printed_rules_text   text NOT NULL,
      printed_effect_text  text NOT NULL DEFAULT '',
      image_url            text,
      created_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_candidate_printings_rarity CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')),
      CONSTRAINT chk_candidate_printings_finish CHECK (finish IN ('normal', 'foil'))
    )
  `.execute(db);

  await sql`CREATE INDEX idx_candidate_printings_card ON candidate_printings(candidate_card_id)`.execute(
    db,
  );

  await sql`
    CREATE TABLE card_name_aliases (
      alias       text PRIMARY KEY,
      card_id     text NOT NULL REFERENCES cards(id)
    )
  `.execute(db);

  // Make printings.image_url nullable (imported cards may not have images)
  await sql`ALTER TABLE printings ALTER COLUMN image_url DROP NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS card_name_aliases`.execute(db);
  await sql`DROP TABLE IF EXISTS candidate_printings`.execute(db);
  await sql`DROP TABLE IF EXISTS candidate_cards`.execute(db);

  // Restore NOT NULL — fill empty string first to avoid constraint violation
  await sql`UPDATE printings SET image_url = '' WHERE image_url IS NULL`.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN image_url SET NOT NULL`.execute(db);
}
