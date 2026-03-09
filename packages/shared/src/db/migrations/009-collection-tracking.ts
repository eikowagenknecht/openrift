import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Collections ───────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE collections (
      id                         uuid PRIMARY KEY,
      user_id                    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name                       text NOT NULL,
      description                text,
      available_for_deckbuilding boolean NOT NULL DEFAULT true,
      is_inbox                   boolean NOT NULL DEFAULT false,
      sort_order                 integer NOT NULL DEFAULT 0,
      share_token                text UNIQUE,
      created_at                 timestamptz NOT NULL DEFAULT now(),
      updated_at                 timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_collections_user_id ON collections(user_id)`.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_collections_user_inbox
      ON collections(user_id) WHERE is_inbox = true
  `.execute(db);

  await sql`
    ALTER TABLE collections ADD CONSTRAINT uq_collections_id_user
      UNIQUE (id, user_id)
  `.execute(db);

  // ── Collection deletion guard ─────────────────────────────────────────────
  await sql`
    CREATE FUNCTION prevent_nonempty_collection_delete()
    RETURNS TRIGGER AS $$
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
    CREATE TRIGGER trg_prevent_nonempty_collection_delete
      BEFORE DELETE ON collections
      FOR EACH ROW
      EXECUTE FUNCTION prevent_nonempty_collection_delete()
  `.execute(db);

  // ── Sources ───────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE sources (
      id          uuid PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        text NOT NULL,
      description text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_sources_user_id ON sources(user_id)`.execute(db);

  await sql`
    ALTER TABLE sources ADD CONSTRAINT uq_sources_id_user
      UNIQUE (id, user_id)
  `.execute(db);

  // ── Copies ────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE copies (
      id            uuid PRIMARY KEY,
      user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      printing_id   text NOT NULL REFERENCES printings(id),
      collection_id uuid NOT NULL,
      CONSTRAINT fk_copies_collection_user
        FOREIGN KEY (collection_id, user_id) REFERENCES collections(id, user_id)
        ON DELETE CASCADE,
      source_id     uuid,
      CONSTRAINT fk_copies_source_user
        FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id)
        ON DELETE SET NULL (source_id),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_copies_user_printing ON copies(user_id, printing_id)`.execute(db);
  await sql`CREATE INDEX idx_copies_collection ON copies(collection_id)`.execute(db);
  await sql`CREATE INDEX idx_copies_source ON copies(source_id)`.execute(db);

  await sql`
    ALTER TABLE copies ADD CONSTRAINT uq_copies_id_user
      UNIQUE (id, user_id)
  `.execute(db);

  // ── Activities ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE activities (
      id          uuid PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        text NOT NULL,
      name        text,
      date        date NOT NULL DEFAULT CURRENT_DATE,
      description text,
      is_auto     boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_activities_type
        CHECK (type IN ('acquisition', 'disposal', 'trade', 'reorganization'))
    )
  `.execute(db);

  await sql`CREATE INDEX idx_activities_user_id ON activities(user_id)`.execute(db);

  await sql`
    ALTER TABLE activities ADD CONSTRAINT uq_activities_id_user_type
      UNIQUE (id, user_id, type)
  `.execute(db);

  // ── Activity Items ────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE activity_items (
      id                   uuid PRIMARY KEY,
      activity_id          uuid NOT NULL,
      user_id              text NOT NULL,
      activity_type        text NOT NULL,
      CONSTRAINT fk_activity_items_activity_user
        FOREIGN KEY (activity_id, user_id, activity_type)
        REFERENCES activities(id, user_id, type)
        ON DELETE CASCADE,
      copy_id              uuid,
      CONSTRAINT fk_activity_items_copy_user
        FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
        ON DELETE SET NULL (copy_id),
      printing_id          text NOT NULL REFERENCES printings(id),
      action               text NOT NULL,
      from_collection_id   uuid,
      CONSTRAINT fk_activity_items_from_collection_user
        FOREIGN KEY (from_collection_id, user_id) REFERENCES collections(id, user_id)
        ON DELETE SET NULL (from_collection_id),
      from_collection_name text,
      to_collection_id     uuid,
      CONSTRAINT fk_activity_items_to_collection_user
        FOREIGN KEY (to_collection_id, user_id) REFERENCES collections(id, user_id)
        ON DELETE SET NULL (to_collection_id),
      to_collection_name   text,
      metadata_snapshot    jsonb,
      created_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_activity_items_action
        CHECK (action IN ('added', 'removed', 'moved')),
      CONSTRAINT chk_activity_items_type_action
        CHECK (
          (activity_type = 'acquisition'    AND action = 'added')   OR
          (activity_type = 'disposal'       AND action = 'removed') OR
          (activity_type = 'trade'          AND action IN ('added', 'removed')) OR
          (activity_type = 'reorganization' AND action = 'moved')
        )
    )
  `.execute(db);

  await sql`CREATE INDEX idx_activity_items_activity ON activity_items(activity_id)`.execute(db);
  await sql`CREATE INDEX idx_activity_items_copy ON activity_items(copy_id)`.execute(db);

  // ── Decks ─────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE decks (
      id          uuid PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        text NOT NULL,
      description text,
      format      text NOT NULL,
      is_wanted   boolean NOT NULL DEFAULT false,
      is_public   boolean NOT NULL DEFAULT false,
      share_token text UNIQUE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_decks_format CHECK (format IN ('standard', 'freeform'))
    )
  `.execute(db);

  await sql`CREATE INDEX idx_decks_user_id ON decks(user_id)`.execute(db);

  // ── Deck Cards ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE deck_cards (
      id       uuid PRIMARY KEY,
      deck_id  uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_id  text NOT NULL REFERENCES cards(id),
      zone     text NOT NULL,
      quantity integer NOT NULL DEFAULT 1,
      CONSTRAINT chk_deck_cards_quantity CHECK (quantity > 0),
      CONSTRAINT chk_deck_cards_zone CHECK (zone IN ('main', 'sideboard')),
      CONSTRAINT uq_deck_cards UNIQUE (deck_id, card_id, zone)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id)`.execute(db);

  // ── Wish Lists ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE wish_lists (
      id          uuid PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        text NOT NULL,
      rules       jsonb,
      share_token text UNIQUE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_wish_lists_user_id ON wish_lists(user_id)`.execute(db);

  await sql`
    ALTER TABLE wish_lists ADD CONSTRAINT uq_wish_lists_id_user
      UNIQUE (id, user_id)
  `.execute(db);

  // ── Wish List Items ───────────────────────────────────────────────────────
  await sql`
    CREATE TABLE wish_list_items (
      id               uuid PRIMARY KEY,
      wish_list_id     uuid NOT NULL,
      user_id          text NOT NULL,
      CONSTRAINT fk_wish_list_items_list_user
        FOREIGN KEY (wish_list_id, user_id) REFERENCES wish_lists(id, user_id)
        ON DELETE CASCADE,
      card_id          text REFERENCES cards(id),
      printing_id      text REFERENCES printings(id),
      quantity_desired integer NOT NULL DEFAULT 1,
      CONSTRAINT chk_wish_list_items_quantity CHECK (quantity_desired > 0),
      CONSTRAINT chk_wish_list_items_target
        CHECK (
          (card_id IS NOT NULL AND printing_id IS NULL) OR
          (card_id IS NULL AND printing_id IS NOT NULL)
        ),
      CONSTRAINT uq_wish_list_items_card UNIQUE (wish_list_id, card_id),
      CONSTRAINT uq_wish_list_items_printing UNIQUE (wish_list_id, printing_id)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_wish_list_items_list ON wish_list_items(wish_list_id)`.execute(db);

  // ── Trade Lists ───────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE trade_lists (
      id          uuid PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        text NOT NULL,
      rules       jsonb,
      share_token text UNIQUE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_trade_lists_user_id ON trade_lists(user_id)`.execute(db);

  await sql`
    ALTER TABLE trade_lists ADD CONSTRAINT uq_trade_lists_id_user
      UNIQUE (id, user_id)
  `.execute(db);

  // ── Trade List Items ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE trade_list_items (
      id            uuid PRIMARY KEY,
      trade_list_id uuid NOT NULL,
      user_id       text NOT NULL,
      CONSTRAINT fk_trade_list_items_list_user
        FOREIGN KEY (trade_list_id, user_id) REFERENCES trade_lists(id, user_id)
        ON DELETE CASCADE,
      copy_id       uuid NOT NULL,
      CONSTRAINT fk_trade_list_items_copy_user
        FOREIGN KEY (copy_id, user_id) REFERENCES copies(id, user_id)
        ON DELETE CASCADE,
      CONSTRAINT uq_trade_list_items UNIQUE (trade_list_id, copy_id)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_trade_list_items_list ON trade_list_items(trade_list_id)`.execute(db);
  await sql`CREATE INDEX idx_trade_list_items_copy ON trade_list_items(copy_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS trade_list_items`.execute(db);
  await sql`DROP TABLE IF EXISTS trade_lists`.execute(db);
  await sql`DROP TABLE IF EXISTS wish_list_items`.execute(db);
  await sql`DROP TABLE IF EXISTS wish_lists`.execute(db);
  await sql`DROP TABLE IF EXISTS deck_cards`.execute(db);
  await sql`DROP TABLE IF EXISTS decks`.execute(db);
  await sql`DROP TABLE IF EXISTS activity_items`.execute(db);
  await sql`DROP TABLE IF EXISTS activities`.execute(db);
  await sql`DROP TABLE IF EXISTS copies`.execute(db);
  await sql`DROP TABLE IF EXISTS sources`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_prevent_nonempty_collection_delete ON collections`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS prevent_nonempty_collection_delete`.execute(db);
  await sql`DROP TABLE IF EXISTS collections`.execute(db);
}
