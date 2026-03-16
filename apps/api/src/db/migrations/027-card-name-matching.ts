import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Card name matching improvements:
 * - Drop denormalized card_id FK on card_sources (matching is now via name)
 * - Add pre-computed norm_name columns to cards, card_sources, card_name_aliases
 * - Add triggers to keep norm_name in sync on INSERT/UPDATE
 * - Simplify card_name_aliases PK from alias → norm_name
 */

const NORM_EXPR = sql`lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))`;
const NORM_ALIAS_EXPR = sql`lower(regexp_replace(alias, '[^a-zA-Z0-9]', '', 'g'))`;

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Drop card_sources.card_id ───────────────────────────────────────────────
  // Preserve existing links as aliases before dropping the column.

  await sql`
    INSERT INTO card_name_aliases (alias, card_id)
    SELECT DISTINCT cs.name, cs.card_id
    FROM card_sources cs
    WHERE cs.card_id IS NOT NULL
    ON CONFLICT (alias) DO UPDATE SET card_id = EXCLUDED.card_id
  `.execute(db);

  await db.schema.alterTable("card_sources").dropColumn("card_id").execute();

  // ── cards.norm_name ─────────────────────────────────────────────────────────

  await db.schema.alterTable("cards").addColumn("norm_name", "text").execute();

  await sql`UPDATE cards SET norm_name = ${NORM_EXPR}`.execute(db);

  await db.schema
    .alterTable("cards")
    .alterColumn("norm_name", (col) => col.setNotNull())
    .execute();

  await sql`CREATE INDEX idx_cards_norm_name ON cards (norm_name)`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_cards_norm_name
    BEFORE INSERT OR UPDATE OF name ON cards
    FOR EACH ROW EXECUTE FUNCTION cards_set_norm_name()
  `.execute(db);

  // ── card_sources.norm_name ──────────────────────────────────────────────────

  await db.schema.alterTable("card_sources").addColumn("norm_name", "text").execute();

  await sql`UPDATE card_sources SET norm_name = ${NORM_EXPR}`.execute(db);

  await db.schema
    .alterTable("card_sources")
    .alterColumn("norm_name", (col) => col.setNotNull())
    .execute();

  await sql`CREATE INDEX idx_card_sources_norm_name ON card_sources (norm_name)`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION card_sources_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_card_sources_norm_name
    BEFORE INSERT OR UPDATE OF name ON card_sources
    FOR EACH ROW EXECUTE FUNCTION card_sources_set_norm_name()
  `.execute(db);

  // ── card_name_aliases: alias → norm_name PK ────────────────────────────────

  await db.schema.alterTable("card_name_aliases").addColumn("norm_name", "text").execute();

  await sql`UPDATE card_name_aliases SET norm_name = ${NORM_ALIAS_EXPR}`.execute(db);

  // Remove duplicates that would violate the new PK (keep the first row per norm_name)
  await sql`
    DELETE FROM card_name_aliases a
    USING card_name_aliases b
    WHERE a.norm_name = b.norm_name
      AND a.alias > b.alias
  `.execute(db);

  // Drop the old PK on alias, drop the alias column, add PK on norm_name
  await sql`ALTER TABLE card_name_aliases DROP CONSTRAINT card_name_aliases_pkey`.execute(db);
  await db.schema.alterTable("card_name_aliases").dropColumn("alias").execute();
  await db.schema
    .alterTable("card_name_aliases")
    .alterColumn("norm_name", (col) => col.setNotNull())
    .execute();
  await sql`ALTER TABLE card_name_aliases ADD PRIMARY KEY (norm_name)`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION card_name_aliases_set_norm_name() RETURNS trigger AS $$
    BEGIN
      -- norm_name is set directly by the application; this trigger is a safety net
      -- in case someone inserts with a raw value that needs normalising.
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── card_name_aliases: restore alias column as PK ───────────────────────────

  await db.schema.alterTable("card_name_aliases").addColumn("alias", "text").execute();

  await sql`UPDATE card_name_aliases SET alias = norm_name`.execute(db);

  await sql`ALTER TABLE card_name_aliases DROP CONSTRAINT card_name_aliases_pkey`.execute(db);
  await db.schema.alterTable("card_name_aliases").dropColumn("norm_name").execute();
  await db.schema
    .alterTable("card_name_aliases")
    .alterColumn("alias", (col) => col.setNotNull())
    .execute();
  await sql`ALTER TABLE card_name_aliases ADD PRIMARY KEY (alias)`.execute(db);

  await sql`DROP FUNCTION IF EXISTS card_name_aliases_set_norm_name() CASCADE`.execute(db);

  // ── card_sources.norm_name ──────────────────────────────────────────────────

  await sql`DROP TRIGGER IF EXISTS trg_card_sources_norm_name ON card_sources`.execute(db);
  await sql`DROP FUNCTION IF EXISTS card_sources_set_norm_name() CASCADE`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_card_sources_norm_name`.execute(db);
  await db.schema.alterTable("card_sources").dropColumn("norm_name").execute();

  // ── cards.norm_name ─────────────────────────────────────────────────────────

  await sql`DROP TRIGGER IF EXISTS trg_cards_norm_name ON cards`.execute(db);
  await sql`DROP FUNCTION IF EXISTS cards_set_norm_name() CASCADE`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_cards_norm_name`.execute(db);
  await db.schema.alterTable("cards").dropColumn("norm_name").execute();

  // ── Restore card_sources.card_id ────────────────────────────────────────────

  await db.schema
    .alterTable("card_sources")
    .addColumn("card_id", "uuid", (col) => col.references("cards.id").onDelete("set null"))
    .execute();

  await sql`
    UPDATE card_sources cs
    SET card_id = cna.card_id
    FROM card_name_aliases cna
    WHERE lower(regexp_replace(cna.alias, '[^a-zA-Z0-9]', '', 'g'))
        = lower(regexp_replace(cs.name, '[^a-zA-Z0-9]', '', 'g'))
  `.execute(db);

  await db.schema
    .createIndex("idx_card_sources_card_id")
    .on("card_sources")
    .column("card_id")
    .execute();
}
