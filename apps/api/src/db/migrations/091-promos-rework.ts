import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── markers ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("markers")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`uuidv7()`)
        .notNull(),
    )
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("markers_slug_check", sql`slug <> ''`)
    .addCheckConstraint("markers_label_check", sql`label <> ''`)
    .addCheckConstraint("markers_description_check", sql`description <> ''`)
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON markers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Seed the generic 'promo' marker plus a marker per existing promo_type so
  // each existing promo printing keeps its own visual identity (no collisions
  // when two printings share card/short_code/finish/language but had different
  // promo_types). Operators can later consolidate via the admin UI.
  await sql`
    INSERT INTO markers (slug, label, description, sort_order)
    VALUES ('promo', 'Promo', 'Generic promo stamp', 0)
  `.execute(db);

  await sql`
    INSERT INTO markers (slug, label, description, sort_order)
    SELECT slug, label, description, sort_order
    FROM promo_types
    ON CONFLICT (slug) DO NOTHING
  `.execute(db);

  // ── printing_markers join ─────────────────────────────────────────────
  await db.schema
    .createTable("printing_markers")
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("marker_id", "uuid", (col) => col.notNull())
    .addPrimaryKeyConstraint("printing_markers_pkey", ["printing_id", "marker_id"])
    .execute();

  await db.schema
    .alterTable("printing_markers")
    .addForeignKeyConstraint("printing_markers_printing_id_fkey", ["printing_id"], "printings", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("printing_markers")
    .addForeignKeyConstraint("printing_markers_marker_id_fkey", ["marker_id"], "markers", ["id"])
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("idx_printing_markers_marker_id")
    .on("printing_markers")
    .column("marker_id")
    .execute();

  // ── printings.marker_slugs (denormalized, sorted, GIN-indexed) ────────
  await db.schema
    .alterTable("printings")
    .addColumn("marker_slugs", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute();

  await sql`CREATE INDEX idx_printings_marker_slugs ON printings USING GIN (marker_slugs)`.execute(
    db,
  );

  // Maintenance functions + triggers for marker_slugs.
  await sql`
    CREATE FUNCTION recompute_printing_marker_slugs(target_printing_id uuid) RETURNS void AS $$
      UPDATE printings
      SET marker_slugs = COALESCE(
        (SELECT array_agg(m.slug ORDER BY m.slug)
         FROM printing_markers pm
         JOIN markers m ON m.id = pm.marker_id
         WHERE pm.printing_id = target_printing_id),
        '{}'::text[]
      )
      WHERE id = target_printing_id;
    $$ LANGUAGE sql;
  `.execute(db);

  await sql`
    CREATE FUNCTION trg_printing_markers_sync() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_printing_marker_slugs(OLD.printing_id);
        RETURN OLD;
      ELSE
        PERFORM recompute_printing_marker_slugs(NEW.printing_id);
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER printing_markers_sync_iud
    AFTER INSERT OR UPDATE OR DELETE ON printing_markers
    FOR EACH ROW EXECUTE FUNCTION trg_printing_markers_sync()
  `.execute(db);

  await sql`
    CREATE FUNCTION trg_markers_slug_change() RETURNS trigger AS $$
    DECLARE
      affected_id uuid;
    BEGIN
      IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        FOR affected_id IN SELECT printing_id FROM printing_markers WHERE marker_id = NEW.id LOOP
          PERFORM recompute_printing_marker_slugs(affected_id);
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER markers_slug_change
    AFTER UPDATE OF slug ON markers
    FOR EACH ROW EXECUTE FUNCTION trg_markers_slug_change()
  `.execute(db);

  // ── rename promo_types → distribution_channels, add kind ──────────────
  await db.schema.alterTable("promo_types").renameTo("distribution_channels").execute();

  await db.schema
    .alterTable("distribution_channels")
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("event"))
    .execute();

  await db.schema
    .alterTable("distribution_channels")
    .addCheckConstraint("distribution_channels_kind_check", sql`kind IN ('event', 'product')`)
    .execute();

  // Rename inherited constraints from promo_types_* → distribution_channels_*.
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT promo_types_pkey TO distribution_channels_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT promo_types_slug_key TO distribution_channels_slug_key`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT promo_types_slug_check TO distribution_channels_slug_check`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT promo_types_label_check TO distribution_channels_label_check`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT promo_types_description_check TO distribution_channels_description_check`.execute(
    db,
  );

  // ── printing_distribution_channels join ───────────────────────────────
  await db.schema
    .createTable("printing_distribution_channels")
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("channel_id", "uuid", (col) => col.notNull())
    .addColumn("distribution_note", "text")
    .addPrimaryKeyConstraint("printing_distribution_channels_pkey", ["printing_id", "channel_id"])
    .addCheckConstraint("printing_distribution_channels_note_check", sql`distribution_note <> ''`)
    .execute();

  await db.schema
    .alterTable("printing_distribution_channels")
    .addForeignKeyConstraint(
      "printing_distribution_channels_printing_id_fkey",
      ["printing_id"],
      "printings",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("printing_distribution_channels")
    .addForeignKeyConstraint(
      "printing_distribution_channels_channel_id_fkey",
      ["channel_id"],
      "distribution_channels",
      ["id"],
    )
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("idx_printing_distribution_channels_channel_id")
    .on("printing_distribution_channels")
    .column("channel_id")
    .execute();

  // ── data migration ────────────────────────────────────────────────────
  // Each printing.promo_type_id becomes (a) a printing_distribution_channels
  // row and (b) a printing_markers row pointing at the marker that shares the
  // promo_type's slug (seeded above). 1:1 mapping preserves visual identity
  // even when two printings share card/short_code/finish/language but had
  // different promo_types — no collisions on the new uniqueness constraint.
  await sql`
    INSERT INTO printing_distribution_channels (printing_id, channel_id)
    SELECT id, promo_type_id FROM printings WHERE promo_type_id IS NOT NULL
  `.execute(db);

  await sql`
    INSERT INTO printing_markers (printing_id, marker_id)
    SELECT p.id, m.id
    FROM printings p
    JOIN promo_types pt ON pt.id = p.promo_type_id
    JOIN markers m ON m.slug = pt.slug
  `.execute(db);

  // ── drop materialized view (rebuild after schema swap) ────────────────
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  // ── swap printings.promo_type_id → marker_slugs in constraints ────────
  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await db.schema.alterTable("printings").dropConstraint("printings_promo_type_id_fkey").execute();
  await db.schema.alterTable("printings").dropColumn("promo_type_id").execute();

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language)
  `.execute(db);

  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "short_code",
      "art_variant",
      "is_signed",
      "marker_slugs",
      "rarity",
      "finish",
      "language",
    ])
    .execute();

  // ── candidate_printings: same swap, simpler (no join table) ───────────
  await db.schema
    .alterTable("candidate_printings")
    .addColumn("marker_slugs", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute();

  await sql`
    UPDATE candidate_printings SET marker_slugs = ARRAY['promo']
    WHERE promo_type_id IS NOT NULL
  `.execute(db);

  await db.schema
    .alterTable("candidate_printings")
    .dropConstraint("printing_sources_promo_type_id_fkey")
    .execute();
  await db.schema.alterTable("candidate_printings").dropColumn("promo_type_id").execute();

  // ── recreate mv_latest_printing_prices using marker_slugs ─────────────
  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (target.id, mp.marketplace)
      target.id           AS printing_id,
      mp.marketplace      AS marketplace,
      CASE WHEN mp.marketplace = 'cardmarket'
           THEN COALESCE(snap.low_cents, snap.market_cents)
           ELSE COALESCE(snap.market_cents, snap.low_cents)
      END                 AS headline_cents
    FROM printings target
    JOIN printings source
      ON  source.card_id      = target.card_id
      AND source.short_code   = target.short_code
      AND source.finish       = target.finish
      AND source.art_variant  = target.art_variant
      AND source.is_signed    = target.is_signed
      AND source.marker_slugs = target.marker_slugs
    JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
    JOIN marketplace_products         mp  ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_snapshots        snap ON snap.variant_id = mpv.id
    WHERE CASE WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(snap.low_cents, snap.market_cents)
               ELSE COALESCE(snap.market_cents, snap.low_cents)
          END IS NOT NULL
      AND (mpv.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, snap.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  // candidate_printings: restore promo_type_id (lossy — original mapping is gone)
  await db.schema.alterTable("candidate_printings").addColumn("promo_type_id", "uuid").execute();
  await db.schema.alterTable("candidate_printings").dropColumn("marker_slugs").execute();

  // printings: restore promo_type_id (lossy — pick first channel per printing)
  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await db.schema.alterTable("printings").addColumn("promo_type_id", "uuid").execute();

  await sql`
    UPDATE printings p SET promo_type_id = (
      SELECT channel_id FROM printing_distribution_channels pdc
      WHERE pdc.printing_id = p.id
      ORDER BY channel_id LIMIT 1
    )
  `.execute(db);

  await db.schema.alterTable("printings").dropColumn("marker_slugs").execute();

  await db.schema.dropTable("printing_distribution_channels").execute();

  // Reverse the rename + kind addition
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT distribution_channels_description_check TO promo_types_description_check`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT distribution_channels_label_check TO promo_types_label_check`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT distribution_channels_slug_check TO promo_types_slug_check`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT distribution_channels_slug_key TO promo_types_slug_key`.execute(
    db,
  );
  await sql`ALTER TABLE distribution_channels RENAME CONSTRAINT distribution_channels_pkey TO promo_types_pkey`.execute(
    db,
  );
  await db.schema.alterTable("distribution_channels").dropColumn("kind").execute();
  await db.schema.alterTable("distribution_channels").renameTo("promo_types").execute();

  // Re-add FKs against the (renamed-back) promo_types
  await db.schema
    .alterTable("printings")
    .addForeignKeyConstraint("printings_promo_type_id_fkey", ["promo_type_id"], "promo_types", [
      "id",
    ])
    .execute();
  await db.schema
    .alterTable("candidate_printings")
    .addForeignKeyConstraint(
      "printing_sources_promo_type_id_fkey",
      ["promo_type_id"],
      "promo_types",
      ["id"],
    )
    .execute();

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, promo_type_id, language)
  `.execute(db);
  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "short_code",
      "art_variant",
      "is_signed",
      "promo_type_id",
      "rarity",
      "finish",
      "language",
    ])
    .execute();

  // Drop triggers + functions, then markers/printing_markers
  await sql`DROP TRIGGER IF EXISTS markers_slug_change ON markers`.execute(db);
  await sql`DROP FUNCTION IF EXISTS trg_markers_slug_change()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS printing_markers_sync_iud ON printing_markers`.execute(db);
  await sql`DROP FUNCTION IF EXISTS trg_printing_markers_sync()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS recompute_printing_marker_slugs(uuid)`.execute(db);

  await db.schema.dropTable("printing_markers").execute();
  await db.schema.dropTable("markers").execute();

  // Restore mv_latest_printing_prices
  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (target.id, mp.marketplace)
      target.id           AS printing_id,
      mp.marketplace      AS marketplace,
      CASE WHEN mp.marketplace = 'cardmarket'
           THEN COALESCE(snap.low_cents, snap.market_cents)
           ELSE COALESCE(snap.market_cents, snap.low_cents)
      END                 AS headline_cents
    FROM printings target
    JOIN printings source
      ON  source.card_id      = target.card_id
      AND source.short_code   = target.short_code
      AND source.finish       = target.finish
      AND source.art_variant  = target.art_variant
      AND source.is_signed    = target.is_signed
      AND source.promo_type_id IS NOT DISTINCT FROM target.promo_type_id
    JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
    JOIN marketplace_products         mp  ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_snapshots        snap ON snap.variant_id = mpv.id
    WHERE CASE WHEN mp.marketplace = 'cardmarket'
               THEN COALESCE(snap.low_cents, snap.market_cents)
               ELSE COALESCE(snap.market_cents, snap.low_cents)
          END IS NOT NULL
      AND (mpv.language IS NULL OR source.id = target.id)
    ORDER BY target.id, mp.marketplace, snap.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);
}
