import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Clean up rows with NULL group_id (caused by unmap bug) ─────────────────
  await sql`
    DELETE FROM tcgplayer_snapshots
    WHERE source_id IN (SELECT id FROM tcgplayer_sources WHERE group_id IS NULL)
  `.execute(db);
  await sql`DELETE FROM tcgplayer_sources WHERE group_id IS NULL`.execute(db);
  await sql`DELETE FROM tcgplayer_staging WHERE group_id IS NULL`.execute(db);

  await sql`
    DELETE FROM cardmarket_snapshots
    WHERE source_id IN (SELECT id FROM cardmarket_sources WHERE group_id IS NULL)
  `.execute(db);
  await sql`DELETE FROM cardmarket_sources WHERE group_id IS NULL`.execute(db);
  await sql`DELETE FROM cardmarket_staging WHERE group_id IS NULL`.execute(db);

  // ── Clean up rows with NULL product_name (same unmap bug) ──────────────────
  await sql`
    DELETE FROM tcgplayer_snapshots
    WHERE source_id IN (SELECT id FROM tcgplayer_sources WHERE product_name IS NULL)
  `.execute(db);
  await sql`DELETE FROM tcgplayer_sources WHERE product_name IS NULL`.execute(db);

  await sql`
    DELETE FROM cardmarket_snapshots
    WHERE source_id IN (SELECT id FROM cardmarket_sources WHERE product_name IS NULL)
  `.execute(db);
  await sql`DELETE FROM cardmarket_sources WHERE product_name IS NULL`.execute(db);

  // ── Drop unused url column (URLs are derived from external_id) ─────────────
  await sql`ALTER TABLE tcgplayer_sources DROP COLUMN url`.execute(db);
  await sql`ALTER TABLE cardmarket_sources DROP COLUMN url`.execute(db);

  // ── Add NOT NULL constraints ───────────────────────────────────────────────
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN group_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN external_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN product_name SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging ALTER COLUMN group_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging ALTER COLUMN external_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN group_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN external_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN product_name SET NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_staging ALTER COLUMN group_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_staging ALTER COLUMN external_id SET NOT NULL`.execute(db);

  // ── Add foreign keys ──────────────────────────────────────────────────────
  await sql`
    ALTER TABLE tcgplayer_sources
    ADD CONSTRAINT fk_tcgplayer_sources_group
    FOREIGN KEY (group_id) REFERENCES tcgplayer_groups(group_id)
  `.execute(db);

  await sql`
    ALTER TABLE tcgplayer_staging
    ADD CONSTRAINT fk_tcgplayer_staging_group
    FOREIGN KEY (group_id) REFERENCES tcgplayer_groups(group_id)
  `.execute(db);

  await sql`
    ALTER TABLE cardmarket_sources
    ADD CONSTRAINT fk_cardmarket_sources_expansion
    FOREIGN KEY (group_id) REFERENCES cardmarket_expansions(expansion_id)
  `.execute(db);

  await sql`
    ALTER TABLE cardmarket_staging
    ADD CONSTRAINT fk_cardmarket_staging_expansion
    FOREIGN KEY (group_id) REFERENCES cardmarket_expansions(expansion_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cardmarket_staging DROP CONSTRAINT fk_cardmarket_staging_expansion`.execute(
    db,
  );
  await sql`ALTER TABLE cardmarket_sources DROP CONSTRAINT fk_cardmarket_sources_expansion`.execute(
    db,
  );
  await sql`ALTER TABLE tcgplayer_staging DROP CONSTRAINT fk_tcgplayer_staging_group`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources DROP CONSTRAINT fk_tcgplayer_sources_group`.execute(db);

  await sql`ALTER TABLE tcgplayer_sources ADD COLUMN url text`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ADD COLUMN url text`.execute(db);

  await sql`ALTER TABLE cardmarket_staging ALTER COLUMN external_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_staging ALTER COLUMN group_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN product_name DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN external_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE cardmarket_sources ALTER COLUMN group_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging ALTER COLUMN external_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging ALTER COLUMN group_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN product_name DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN external_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE tcgplayer_sources ALTER COLUMN group_id DROP NOT NULL`.execute(db);
}
