import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── TCGPlayer ─────────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE tcgplayer_groups (
      id            serial PRIMARY KEY,
      group_id      integer NOT NULL UNIQUE,
      name          text NOT NULL,
      abbreviation  text NOT NULL,
      set_id        text REFERENCES sets(id),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE tcgplayer_sources (
      id            serial PRIMARY KEY,
      printing_id   text NOT NULL REFERENCES printings(id) UNIQUE,
      external_id   integer,
      group_id      integer,
      product_name  text,
      url           text,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE tcgplayer_snapshots (
      id            serial PRIMARY KEY,
      source_id     integer NOT NULL REFERENCES tcgplayer_sources(id),
      recorded_at   timestamptz NOT NULL DEFAULT now(),
      market_cents  integer NOT NULL,
      low_cents     integer,
      mid_cents     integer,
      high_cents    integer,
      UNIQUE (source_id, recorded_at)
    )
  `.execute(db);

  await sql`
    CREATE TABLE tcgplayer_staging (
      id            serial PRIMARY KEY,
      set_id        text REFERENCES sets(id),
      external_id   integer,
      group_id      integer,
      product_name  text NOT NULL,
      finish        text NOT NULL,
      recorded_at   timestamptz NOT NULL,
      market_cents  integer NOT NULL,
      low_cents     integer,
      mid_cents     integer,
      high_cents    integer,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (external_id, finish, recorded_at)
    )
  `.execute(db);

  // ── Cardmarket ────────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE cardmarket_expansions (
      id              serial PRIMARY KEY,
      expansion_id    integer NOT NULL UNIQUE,
      set_id          text REFERENCES sets(id),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_sources (
      id            serial PRIMARY KEY,
      printing_id   text NOT NULL REFERENCES printings(id) UNIQUE,
      external_id   integer,
      group_id      integer,
      product_name  text,
      url           text,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_snapshots (
      id            serial PRIMARY KEY,
      source_id     integer NOT NULL REFERENCES cardmarket_sources(id),
      recorded_at   timestamptz NOT NULL DEFAULT now(),
      market_cents  integer NOT NULL,
      low_cents     integer,
      trend_cents   integer,
      avg1_cents    integer,
      avg7_cents    integer,
      avg30_cents   integer,
      UNIQUE (source_id, recorded_at)
    )
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_staging (
      id            serial PRIMARY KEY,
      set_id        text REFERENCES sets(id),
      external_id   integer,
      group_id      integer,
      product_name  text NOT NULL,
      finish        text NOT NULL,
      recorded_at   timestamptz NOT NULL,
      market_cents  integer NOT NULL,
      low_cents     integer,
      trend_cents   integer,
      avg1_cents    integer,
      avg7_cents    integer,
      avg30_cents   integer,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (external_id, finish, recorded_at)
    )
  `.execute(db);

  // ── Indexes ───────────────────────────────────────────────────────────────

  await sql`CREATE INDEX idx_tcgplayer_sources_printing_id ON tcgplayer_sources(printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_tcgplayer_snapshots_source_id ON tcgplayer_snapshots(source_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_tcgplayer_snapshots_recorded_at ON tcgplayer_snapshots(recorded_at)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_tcgplayer_staging_set_id ON tcgplayer_staging(set_id)`.execute(db);

  await sql`CREATE INDEX idx_cardmarket_sources_printing_id ON cardmarket_sources(printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_cardmarket_snapshots_source_id ON cardmarket_snapshots(source_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_cardmarket_snapshots_recorded_at ON cardmarket_snapshots(recorded_at)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_cardmarket_staging_set_id ON cardmarket_staging(set_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE cardmarket_staging`.execute(db);
  await sql`DROP TABLE cardmarket_snapshots`.execute(db);
  await sql`DROP TABLE cardmarket_sources`.execute(db);
  await sql`DROP TABLE cardmarket_expansions`.execute(db);
  await sql`DROP TABLE tcgplayer_staging`.execute(db);
  await sql`DROP TABLE tcgplayer_snapshots`.execute(db);
  await sql`DROP TABLE tcgplayer_sources`.execute(db);
  await sql`DROP TABLE tcgplayer_groups`.execute(db);
}
