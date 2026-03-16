import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Create unified tables ────────────────────────────────────────────

  await db.schema
    .createTable("marketplace_groups")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("abbreviation", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("marketplace_groups_marketplace_group_id_key", ["marketplace", "group_id"])
    .execute();

  await db.schema
    .createTable("marketplace_sources")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("printing_id", "text", (col) =>
      col.notNull().references("printings.id").onUpdate("cascade"),
    )
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("marketplace_sources_marketplace_printing_id_key", [
      "marketplace",
      "printing_id",
    ])
    .execute();

  await db.schema
    .createTable("marketplace_snapshots")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) => col.notNull().references("marketplace_sources.id"))
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addUniqueConstraint("marketplace_snapshots_source_id_recorded_at_key", [
      "source_id",
      "recorded_at",
    ])
    .execute();

  await db.schema
    .createTable("marketplace_staging")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("group_id", "integer", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("marketplace_staging_marketplace_external_id_finish_recorded_at_key", [
      "marketplace",
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  await db.schema
    .createTable("marketplace_ignored_products")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("marketplace_ignored_products_pkey", [
      "marketplace",
      "external_id",
      "finish",
    ])
    .execute();

  await db.schema
    .createTable("marketplace_staging_card_overrides")
    .addColumn("marketplace", "text", (col) => col.notNull())
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id").onUpdate("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("marketplace_staging_card_overrides_pkey", [
      "marketplace",
      "external_id",
      "finish",
    ])
    .execute();

  // ── Indexes ──────────────────────────────────────────────────────────────

  await db.schema
    .createIndex("idx_marketplace_sources_printing_id")
    .on("marketplace_sources")
    .column("printing_id")
    .execute();

  await db.schema
    .createIndex("idx_marketplace_snapshots_source_id_recorded_at")
    .on("marketplace_snapshots")
    .columns(["source_id", "recorded_at"])
    .execute();

  await db.schema
    .createIndex("idx_marketplace_staging_marketplace_group_id")
    .on("marketplace_staging")
    .columns(["marketplace", "group_id"])
    .execute();

  // ── 2. Migrate data ─────────────────────────────────────────────────────

  // Groups
  await sql`
    INSERT INTO marketplace_groups (marketplace, group_id, name, abbreviation, created_at, updated_at)
    SELECT 'tcgplayer', group_id, name, abbreviation, created_at, updated_at
    FROM tcgplayer_groups
  `.execute(db);

  await sql`
    INSERT INTO marketplace_groups (marketplace, group_id, name, created_at, updated_at)
    SELECT 'cardmarket', expansion_id, name, created_at, updated_at
    FROM cardmarket_expansions
  `.execute(db);

  // Sources
  await sql`
    INSERT INTO marketplace_sources (marketplace, printing_id, external_id, group_id, product_name, created_at, updated_at)
    SELECT 'tcgplayer', printing_id, external_id, group_id, product_name, created_at, updated_at
    FROM tcgplayer_sources
    WHERE external_id IS NOT NULL AND group_id IS NOT NULL AND product_name IS NOT NULL
  `.execute(db);

  await sql`
    INSERT INTO marketplace_sources (marketplace, printing_id, external_id, group_id, product_name, created_at, updated_at)
    SELECT 'cardmarket', printing_id, external_id, group_id, product_name, created_at, updated_at
    FROM cardmarket_sources
    WHERE external_id IS NOT NULL AND group_id IS NOT NULL AND product_name IS NOT NULL
  `.execute(db);

  // Snapshots — remap source_id via printing_id
  await sql`
    INSERT INTO marketplace_snapshots (source_id, recorded_at, market_cents, low_cents, mid_cents, high_cents)
    SELECT ms.id, ts.recorded_at, ts.market_cents, ts.low_cents, ts.mid_cents, ts.high_cents
    FROM tcgplayer_snapshots ts
    JOIN tcgplayer_sources old_s ON old_s.id = ts.source_id
    JOIN marketplace_sources ms ON ms.marketplace = 'tcgplayer' AND ms.printing_id = old_s.printing_id
  `.execute(db);

  await sql`
    INSERT INTO marketplace_snapshots (source_id, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
    SELECT ms.id, cs.recorded_at, cs.market_cents, cs.low_cents, cs.trend_cents, cs.avg1_cents, cs.avg7_cents, cs.avg30_cents
    FROM cardmarket_snapshots cs
    JOIN cardmarket_sources old_s ON old_s.id = cs.source_id
    JOIN marketplace_sources ms ON ms.marketplace = 'cardmarket' AND ms.printing_id = old_s.printing_id
  `.execute(db);

  // Staging
  await sql`
    INSERT INTO marketplace_staging (marketplace, external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents, created_at)
    SELECT 'tcgplayer', external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents, created_at
    FROM tcgplayer_staging
    WHERE external_id IS NOT NULL AND group_id IS NOT NULL
  `.execute(db);

  await sql`
    INSERT INTO marketplace_staging (marketplace, external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, created_at)
    SELECT 'cardmarket', external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, created_at
    FROM cardmarket_staging
    WHERE external_id IS NOT NULL AND group_id IS NOT NULL
  `.execute(db);

  // Ignored products
  await sql`
    INSERT INTO marketplace_ignored_products (marketplace, external_id, finish, product_name, created_at, updated_at)
    SELECT 'tcgplayer', external_id, finish, product_name, created_at, updated_at
    FROM tcgplayer_ignored_products
  `.execute(db);

  await sql`
    INSERT INTO marketplace_ignored_products (marketplace, external_id, finish, product_name, created_at, updated_at)
    SELECT 'cardmarket', external_id, finish, product_name, created_at, updated_at
    FROM cardmarket_ignored_products
  `.execute(db);

  // Staging card overrides
  await sql`
    INSERT INTO marketplace_staging_card_overrides (marketplace, external_id, finish, card_id, created_at)
    SELECT 'tcgplayer', external_id, finish, card_id, created_at
    FROM tcgplayer_staging_card_overrides
  `.execute(db);

  await sql`
    INSERT INTO marketplace_staging_card_overrides (marketplace, external_id, finish, card_id, created_at)
    SELECT 'cardmarket', external_id, finish, card_id, created_at
    FROM cardmarket_staging_card_overrides
  `.execute(db);

  // ── 3. Drop old tables ──────────────────────────────────────────────────

  await db.schema.dropTable("tcgplayer_snapshots").execute();
  await db.schema.dropTable("cardmarket_snapshots").execute();
  await db.schema.dropTable("tcgplayer_staging").execute();
  await db.schema.dropTable("cardmarket_staging").execute();
  await db.schema.dropTable("tcgplayer_sources").execute();
  await db.schema.dropTable("cardmarket_sources").execute();
  await db.schema.dropTable("tcgplayer_groups").execute();
  await db.schema.dropTable("cardmarket_expansions").execute();
  await db.schema.dropTable("tcgplayer_ignored_products").execute();
  await db.schema.dropTable("cardmarket_ignored_products").execute();
  await db.schema.dropTable("tcgplayer_staging_card_overrides").execute();
  await db.schema.dropTable("cardmarket_staging_card_overrides").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── 1. Recreate old tables ──────────────────────────────────────────────

  // TCGPlayer groups
  await db.schema
    .createTable("tcgplayer_groups")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("group_id", "integer", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("abbreviation", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Cardmarket expansions
  await db.schema
    .createTable("cardmarket_expansions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("expansion_id", "integer", (col) => col.notNull().unique())
    .addColumn("name", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // TCGPlayer sources
  await db.schema
    .createTable("tcgplayer_sources")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("printing_id", "text", (col) =>
      col.notNull().references("printings.id").onUpdate("cascade").unique(),
    )
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Cardmarket sources
  await db.schema
    .createTable("cardmarket_sources")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("printing_id", "text", (col) =>
      col.notNull().references("printings.id").onUpdate("cascade").unique(),
    )
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // TCGPlayer snapshots
  await db.schema
    .createTable("tcgplayer_snapshots")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) => col.notNull().references("tcgplayer_sources.id"))
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("tcgplayer_snapshots_source_id_recorded_at_key", [
      "source_id",
      "recorded_at",
    ])
    .execute();

  // Cardmarket snapshots
  await db.schema
    .createTable("cardmarket_snapshots")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_id", "integer", (col) => col.notNull().references("cardmarket_sources.id"))
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("cardmarket_snapshots_source_id_recorded_at_key", [
      "source_id",
      "recorded_at",
    ])
    .execute();

  // TCGPlayer staging
  await db.schema
    .createTable("tcgplayer_staging")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("mid_cents", "integer")
    .addColumn("high_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("tcgplayer_staging_external_id_finish_recorded_at_key", [
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  // Cardmarket staging
  await db.schema
    .createTable("cardmarket_staging")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("external_id", "integer")
    .addColumn("group_id", "integer")
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull())
    .addColumn("market_cents", "integer", (col) => col.notNull())
    .addColumn("low_cents", "integer")
    .addColumn("trend_cents", "integer")
    .addColumn("avg1_cents", "integer")
    .addColumn("avg7_cents", "integer")
    .addColumn("avg30_cents", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("cardmarket_staging_external_id_finish_recorded_at_key", [
      "external_id",
      "finish",
      "recorded_at",
    ])
    .execute();

  // Ignored products
  await db.schema
    .createTable("tcgplayer_ignored_products")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("tcgplayer_ignored_products_pkey", ["external_id", "finish"])
    .execute();

  await db.schema
    .createTable("cardmarket_ignored_products")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("cardmarket_ignored_products_pkey", ["external_id", "finish"])
    .execute();

  // Staging card overrides
  await db.schema
    .createTable("tcgplayer_staging_card_overrides")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id").onUpdate("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("tcgplayer_staging_card_overrides_pkey", ["external_id", "finish"])
    .execute();

  await db.schema
    .createTable("cardmarket_staging_card_overrides")
    .addColumn("external_id", "integer", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) => col.notNull().references("cards.id").onUpdate("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("cardmarket_staging_card_overrides_pkey", ["external_id", "finish"])
    .execute();

  // ── 2. Migrate data back ────────────────────────────────────────────────

  // Groups
  await sql`
    INSERT INTO tcgplayer_groups (group_id, name, abbreviation, created_at, updated_at)
    SELECT group_id, COALESCE(name, ''), COALESCE(abbreviation, ''), created_at, updated_at
    FROM marketplace_groups WHERE marketplace = 'tcgplayer'
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_expansions (expansion_id, name, created_at, updated_at)
    SELECT group_id, name, created_at, updated_at
    FROM marketplace_groups WHERE marketplace = 'cardmarket'
  `.execute(db);

  // Sources
  await sql`
    INSERT INTO tcgplayer_sources (printing_id, external_id, group_id, product_name, created_at, updated_at)
    SELECT printing_id, external_id, group_id, product_name, created_at, updated_at
    FROM marketplace_sources WHERE marketplace = 'tcgplayer'
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_sources (printing_id, external_id, group_id, product_name, created_at, updated_at)
    SELECT printing_id, external_id, group_id, product_name, created_at, updated_at
    FROM marketplace_sources WHERE marketplace = 'cardmarket'
  `.execute(db);

  // Snapshots
  await sql`
    INSERT INTO tcgplayer_snapshots (source_id, recorded_at, market_cents, low_cents, mid_cents, high_cents)
    SELECT ts.id, snap.recorded_at, snap.market_cents, snap.low_cents, snap.mid_cents, snap.high_cents
    FROM marketplace_snapshots snap
    JOIN marketplace_sources ms ON ms.id = snap.source_id AND ms.marketplace = 'tcgplayer'
    JOIN tcgplayer_sources ts ON ts.printing_id = ms.printing_id
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_snapshots (source_id, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
    SELECT cs.id, snap.recorded_at, snap.market_cents, snap.low_cents, snap.trend_cents, snap.avg1_cents, snap.avg7_cents, snap.avg30_cents
    FROM marketplace_snapshots snap
    JOIN marketplace_sources ms ON ms.id = snap.source_id AND ms.marketplace = 'cardmarket'
    JOIN cardmarket_sources cs ON cs.printing_id = ms.printing_id
  `.execute(db);

  // Staging
  await sql`
    INSERT INTO tcgplayer_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents, created_at)
    SELECT external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents, created_at
    FROM marketplace_staging WHERE marketplace = 'tcgplayer'
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, created_at)
    SELECT external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, created_at
    FROM marketplace_staging WHERE marketplace = 'cardmarket'
  `.execute(db);

  // Ignored products
  await sql`
    INSERT INTO tcgplayer_ignored_products (external_id, finish, product_name, created_at, updated_at)
    SELECT external_id, finish, product_name, created_at, updated_at
    FROM marketplace_ignored_products WHERE marketplace = 'tcgplayer'
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_ignored_products (external_id, finish, product_name, created_at, updated_at)
    SELECT external_id, finish, product_name, created_at, updated_at
    FROM marketplace_ignored_products WHERE marketplace = 'cardmarket'
  `.execute(db);

  // Staging card overrides
  await sql`
    INSERT INTO tcgplayer_staging_card_overrides (external_id, finish, card_id, created_at)
    SELECT external_id, finish, card_id, created_at
    FROM marketplace_staging_card_overrides WHERE marketplace = 'tcgplayer'
  `.execute(db);

  await sql`
    INSERT INTO cardmarket_staging_card_overrides (external_id, finish, card_id, created_at)
    SELECT external_id, finish, card_id, created_at
    FROM marketplace_staging_card_overrides WHERE marketplace = 'cardmarket'
  `.execute(db);

  // ── 3. Drop unified tables ──────────────────────────────────────────────

  await db.schema.dropTable("marketplace_staging_card_overrides").execute();
  await db.schema.dropTable("marketplace_ignored_products").execute();
  await db.schema.dropTable("marketplace_snapshots").execute();
  await db.schema.dropTable("marketplace_staging").execute();
  await db.schema.dropTable("marketplace_sources").execute();
  await db.schema.dropTable("marketplace_groups").execute();
}
