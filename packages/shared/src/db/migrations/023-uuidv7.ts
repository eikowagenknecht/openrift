import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Switch uuid PK defaults from gen_random_uuid() to uuidv7() ──────

  // User-owned tables (previously had no DB default)
  for (const table of [
    "collections",
    "sources",
    "copies",
    "activities",
    "activity_items",
    "decks",
    "deck_cards",
    "wish_lists",
    "wish_list_items",
    "trade_lists",
    "trade_list_items",
  ]) {
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT uuidv7()`).execute(db);
  }

  // Admin/transient tables (previously gen_random_uuid())
  for (const table of ["card_sources", "printing_sources", "printing_images"]) {
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT uuidv7()`).execute(db);
  }

  // ── 2. Convert marketplace serial PKs to uuid with uuidv7() ─────────────

  // marketplace_groups: serial → uuid (no FK references to it)
  await sql`ALTER TABLE marketplace_groups ADD COLUMN new_id uuid DEFAULT uuidv7()`.execute(db);
  await sql`UPDATE marketplace_groups SET new_id = uuidv7() WHERE new_id IS NULL`.execute(db);
  await sql`ALTER TABLE marketplace_groups ALTER COLUMN new_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_groups DROP CONSTRAINT marketplace_groups_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_groups DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_groups RENAME COLUMN new_id TO id`.execute(db);
  await sql`ALTER TABLE marketplace_groups ADD PRIMARY KEY (id)`.execute(db);

  // marketplace_staging: serial → uuid (no FK references to it)
  await sql`ALTER TABLE marketplace_staging ADD COLUMN new_id uuid DEFAULT uuidv7()`.execute(db);
  await sql`UPDATE marketplace_staging SET new_id = uuidv7() WHERE new_id IS NULL`.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN new_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_staging DROP CONSTRAINT marketplace_staging_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_staging DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_staging RENAME COLUMN new_id TO id`.execute(db);
  await sql`ALTER TABLE marketplace_staging ADD PRIMARY KEY (id)`.execute(db);

  // marketplace_sources + marketplace_snapshots: serial → uuid with FK update
  // Step A: Add uuid columns to both tables
  await sql`ALTER TABLE marketplace_sources ADD COLUMN new_id uuid DEFAULT uuidv7()`.execute(db);
  await sql`UPDATE marketplace_sources SET new_id = uuidv7() WHERE new_id IS NULL`.execute(db);
  await sql`ALTER TABLE marketplace_sources ALTER COLUMN new_id SET NOT NULL`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots ADD COLUMN new_id uuid DEFAULT uuidv7()`.execute(db);
  await sql`UPDATE marketplace_snapshots SET new_id = uuidv7() WHERE new_id IS NULL`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots ALTER COLUMN new_id SET NOT NULL`.execute(db);

  // Step B: Add new uuid FK column to snapshots and populate from sources
  await sql`ALTER TABLE marketplace_snapshots ADD COLUMN new_source_id uuid`.execute(db);
  await sql`
    UPDATE marketplace_snapshots snap
    SET new_source_id = src.new_id
    FROM marketplace_sources src
    WHERE src.id = snap.source_id
  `.execute(db);
  await sql`ALTER TABLE marketplace_snapshots ALTER COLUMN new_source_id SET NOT NULL`.execute(db);

  // Step C: Drop old FK and unique constraints on snapshots
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_source_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_source_id_recorded_at_key`.execute(
    db,
  );
  await sql`DROP INDEX idx_marketplace_snapshots_source_id_recorded_at`.execute(db);

  // Step D: Drop old PK and columns, rename new ones
  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT marketplace_sources_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_sources DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_sources RENAME COLUMN new_id TO id`.execute(db);
  await sql`ALTER TABLE marketplace_sources ADD PRIMARY KEY (id)`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN new_id TO id`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots ADD PRIMARY KEY (id)`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots DROP COLUMN source_id`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN new_source_id TO source_id`.execute(db);

  // Step E: Re-add FK and unique constraints with uuid types
  await sql`
    ALTER TABLE marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES marketplace_sources(id)
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_recorded_at_key
    UNIQUE (source_id, recorded_at)
  `.execute(db);
  await sql`
    CREATE INDEX idx_marketplace_snapshots_source_id_recorded_at
    ON marketplace_snapshots (source_id, recorded_at)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── 1. Revert uuid PK defaults to gen_random_uuid() ─────────────────────

  for (const table of [
    "collections",
    "sources",
    "copies",
    "activities",
    "activity_items",
    "decks",
    "deck_cards",
    "wish_lists",
    "wish_list_items",
    "trade_lists",
    "trade_list_items",
  ]) {
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN id DROP DEFAULT`).execute(db);
  }

  for (const table of ["card_sources", "printing_sources", "printing_images"]) {
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`).execute(db);
  }

  // ── 2. Revert marketplace uuid PKs back to serial ──────────────────────

  // marketplace_snapshots FK first
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_source_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_source_id_recorded_at_key`.execute(
    db,
  );
  await sql`DROP INDEX idx_marketplace_snapshots_source_id_recorded_at`.execute(db);

  // marketplace_sources: uuid → serial
  await sql`ALTER TABLE marketplace_sources DROP CONSTRAINT marketplace_sources_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_sources DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_sources ADD COLUMN id serial PRIMARY KEY`.execute(db);

  // marketplace_snapshots: uuid → serial, source_id uuid → integer
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots ADD COLUMN id serial PRIMARY KEY`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots DROP COLUMN source_id`.execute(db);
  await sql`ALTER TABLE marketplace_snapshots ADD COLUMN source_id integer NOT NULL DEFAULT 0`.execute(
    db,
  );
  // Re-populate source_id by printing_id match is not feasible in a clean down migration;
  // the FK data may be lost. Re-add constraints with placeholder values.
  await sql`
    ALTER TABLE marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES marketplace_sources(id)
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_recorded_at_key
    UNIQUE (source_id, recorded_at)
  `.execute(db);
  await sql`
    CREATE INDEX idx_marketplace_snapshots_source_id_recorded_at
    ON marketplace_snapshots (source_id, recorded_at)
  `.execute(db);

  // marketplace_groups: uuid → serial
  await sql`ALTER TABLE marketplace_groups DROP CONSTRAINT marketplace_groups_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_groups DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_groups ADD COLUMN id serial PRIMARY KEY`.execute(db);

  // marketplace_staging: uuid → serial
  await sql`ALTER TABLE marketplace_staging DROP CONSTRAINT marketplace_staging_pkey`.execute(db);
  await sql`ALTER TABLE marketplace_staging DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE marketplace_staging ADD COLUMN id serial PRIMARY KEY`.execute(db);
}
