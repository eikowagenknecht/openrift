import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * ADR-037: multi-type cards ("Unit Gear").
 *
 * - `card_card_types` ordered junction, mirroring `card_domains`; `cards.type`
 *   stays and is always the first type (`types[0]`).
 * - `candidate_cards.type` is replaced by an ordered `types text[]`, mirroring
 *   the existing `super_types text[]`.
 * - `mv_card_aggregates` gains a `types[]` aggregate next to domains/super_types.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE card_card_types (
      card_id   UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      type_slug TEXT NOT NULL REFERENCES card_types(slug),
      position  SMALLINT NOT NULL CHECK (position >= 0),
      PRIMARY KEY (card_id, type_slug),
      UNIQUE (card_id, position)
    );

    CREATE INDEX idx_card_card_types_type_slug ON card_card_types (type_slug)
  `.execute(db);

  await sql`
    INSERT INTO card_card_types (card_id, type_slug, position)
    SELECT id, type, 0 FROM cards
  `.execute(db);

  await sql`
    ALTER TABLE candidate_cards ADD COLUMN types TEXT[] NOT NULL DEFAULT '{}'
  `.execute(db);
  await sql`
    UPDATE candidate_cards SET types = ARRAY[type] WHERE type IS NOT NULL
  `.execute(db);
  await sql`
    ALTER TABLE candidate_cards DROP COLUMN type
  `.execute(db);

  // Materialized views can't be altered; recreate with the types[] aggregate.
  await sql`DROP MATERIALIZED VIEW mv_card_aggregates`.execute(db);
  await sql`
    CREATE MATERIALIZED VIEW mv_card_aggregates AS
    SELECT
      c.id AS card_id,
      COALESCE(
        (SELECT array_agg(cd.domain_slug ORDER BY cd.ordinal)
         FROM card_domains cd WHERE cd.card_id = c.id),
        '{}'
      ) AS domains,
      COALESCE(
        (SELECT array_agg(cst.super_type_slug)
         FROM card_super_types cst WHERE cst.card_id = c.id),
        '{}'
      ) AS super_types,
      COALESCE(
        (SELECT array_agg(cct.type_slug ORDER BY cct.position)
         FROM card_card_types cct WHERE cct.card_id = c.id),
        '{}'
      ) AS types
    FROM cards c
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_mv_card_aggregates_pk
      ON mv_card_aggregates (card_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW mv_card_aggregates`.execute(db);
  await sql`
    CREATE MATERIALIZED VIEW mv_card_aggregates AS
    SELECT
      c.id AS card_id,
      COALESCE(
        (SELECT array_agg(cd.domain_slug ORDER BY cd.ordinal)
         FROM card_domains cd WHERE cd.card_id = c.id),
        '{}'
      ) AS domains,
      COALESCE(
        (SELECT array_agg(cst.super_type_slug)
         FROM card_super_types cst WHERE cst.card_id = c.id),
        '{}'
      ) AS super_types
    FROM cards c
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_mv_card_aggregates_pk
      ON mv_card_aggregates (card_id)
  `.execute(db);

  await sql`
    ALTER TABLE candidate_cards
      ADD COLUMN type TEXT CONSTRAINT chk_candidate_cards_no_empty_type CHECK (type <> '')
  `.execute(db);
  await sql`
    UPDATE candidate_cards SET type = types[1] WHERE cardinality(types) > 0
  `.execute(db);
  await sql`
    ALTER TABLE candidate_cards DROP COLUMN types
  `.execute(db);

  await sql`DROP TABLE card_card_types`.execute(db);
}
