import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * `card_tokens`: which token cards a card tells the player to create.
 *
 * Derived from EN rules text (see `findTokenReferences` in the shared package)
 * because that is the only language whose phrasing we parse. Storing the result
 * as a card-id pair is what makes it language-neutral: every language then
 * renders the token through its own printings.
 *
 * `source` distinguishes derived rows, which the recompute replaces wholesale,
 * from manual ones, which it leaves alone.
 *
 * `mv_card_aggregates` gains `token_card_ids` next to domains/super_types/types
 * so the catalog read path picks it up without another join. The recompute must
 * run before the view refresh, or the view carries the previous derivation.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE card_tokens (
      card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      token_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      source        TEXT NOT NULL DEFAULT 'derived'
        CONSTRAINT chk_card_tokens_source CHECK (source IN ('derived', 'manual')),
      PRIMARY KEY (card_id, token_card_id)
    );

    CREATE INDEX idx_card_tokens_token_card_id ON card_tokens (token_card_id)
  `.execute(db);

  // Materialized views can't be altered; recreate with the token aggregate.
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
      ) AS types,
      COALESCE(
        (SELECT array_agg(ct.token_card_id ORDER BY tc.name)
         FROM card_tokens ct
         JOIN cards tc ON tc.id = ct.token_card_id
         WHERE ct.card_id = c.id),
        '{}'
      ) AS token_card_ids
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

  await sql`DROP TABLE card_tokens`.execute(db);
}
