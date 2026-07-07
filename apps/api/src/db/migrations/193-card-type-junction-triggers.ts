import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * ADR-037 hardening: enforce "every card has at least one card_card_types row"
 * at the database level, so a hand-written INSERT/DELETE can never leave a
 * card with an empty type set (which would fail the non-empty `types` contract
 * on the public catalog and 500 the endpoint for everyone).
 *
 * Two deferred constraint triggers, both firing at commit time so the repos'
 * delete-then-insert replace flow and insert-card-then-junction create flow
 * see the final state, not a transient one:
 *
 * - `cards_seed_card_types`: after a card INSERT, if the transaction ended
 *   without junction rows for the card, seed position 0 from `cards.type`
 *   (NOT NULL + FK, so this is always valid). Repo writes that insert both
 *   are unaffected — by commit the junction exists and the seed skips.
 * - `card_card_types_sync`: after junction changes, reject the transaction if
 *   a still-existing card ended up with zero rows, otherwise re-sync the
 *   denormalized `cards.type` scalar to the lowest-position slug (mirrors the
 *   `printing_markers` → `printings.marker_slugs` sync pattern).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE FUNCTION trg_cards_seed_card_types() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM card_card_types WHERE card_id = NEW.id) THEN
        INSERT INTO card_card_types (card_id, type_slug, position)
        VALUES (NEW.id, NEW.type, 0);
      END IF;
      RETURN NULL;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE CONSTRAINT TRIGGER cards_seed_card_types
      AFTER INSERT ON cards
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION trg_cards_seed_card_types()
  `.execute(db);

  await sql`
    CREATE FUNCTION trg_card_card_types_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      affected_card_id uuid;
      primary_slug text;
    BEGIN
      affected_card_id := COALESCE(NEW.card_id, OLD.card_id);

      -- Card deleted in the same transaction (ON DELETE CASCADE) — nothing to check.
      IF NOT EXISTS (SELECT 1 FROM cards WHERE id = affected_card_id) THEN
        RETURN NULL;
      END IF;

      SELECT type_slug INTO primary_slug
      FROM card_card_types
      WHERE card_id = affected_card_id
      ORDER BY position
      LIMIT 1;

      IF primary_slug IS NULL THEN
        RAISE EXCEPTION 'card % must keep at least one card_card_types row (ADR-037)',
          affected_card_id;
      END IF;

      UPDATE cards SET type = primary_slug
      WHERE id = affected_card_id AND type IS DISTINCT FROM primary_slug;

      RETURN NULL;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE CONSTRAINT TRIGGER card_card_types_sync
      AFTER INSERT OR UPDATE OR DELETE ON card_card_types
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION trg_card_card_types_sync()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS card_card_types_sync ON card_card_types`.execute(db);
  await sql`DROP FUNCTION IF EXISTS trg_card_card_types_sync()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS cards_seed_card_types ON cards`.execute(db);
  await sql`DROP FUNCTION IF EXISTS trg_cards_seed_card_types()`.execute(db);
}
