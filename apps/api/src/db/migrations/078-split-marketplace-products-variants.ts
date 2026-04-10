import type { Kysely } from "kysely";
import { sql } from "kysely";

// Splits marketplace_products into a two-level structure:
//   marketplace_products          = one row per upstream listing     (level 2)
//   marketplace_product_variants  = one row per finish × language    (level 3)
//
// Previously a single marketplace_products row was keyed on (marketplace, printing_id)
// and duplicated external_id / group_id / product_name across foil vs normal rows that
// shared the same upstream listing. The new shape collapses those into one parent
// product row plus N variant rows and hangs snapshots off the variant.
//
// Ignore lists are split the same way:
//   marketplace_ignored_products  = "this upstream listing is not a card at all"
//   marketplace_ignored_variants  = "this specific SKU has no home in our catalog"
//
// ID reuse: the backfill deliberately reuses the existing marketplace_products.id
// values as the new marketplace_product_variants.id values, so marketplace_snapshots
// rows can be repointed with a simple column rename instead of a UUID remap.

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Create marketplace_product_variants ──────────────────────────────────
  await db.schema
    .createTable("marketplace_product_variants")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .defaultTo(sql`uuidv7()`)
        .notNull(),
    )
    .addColumn("marketplace_product_id", "uuid", (col) => col.notNull())
    .addColumn("printing_id", "uuid", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("marketplace_product_variants")
    .addUniqueConstraint("marketplace_product_variants_product_finish_language_key", [
      "marketplace_product_id",
      "finish",
      "language",
    ])
    .execute();

  await db.schema
    .createIndex("idx_marketplace_product_variants_printing_id")
    .on("marketplace_product_variants")
    .column("printing_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_product_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 2. Create marketplace_ignored_variants ──────────────────────────────────
  await db.schema
    .createTable("marketplace_ignored_variants")
    .addColumn("marketplace_product_id", "uuid", (col) => col.notNull())
    .addColumn("finish", "text", (col) => col.notNull())
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .addColumn("product_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("marketplace_ignored_variants_pkey", [
      "marketplace_product_id",
      "finish",
      "language",
    ])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON marketplace_ignored_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // ── 3. Drop snapshot FK / unique / index so we can rename the column ────────
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_product_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_product_id_recorded_at_key`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS idx_marketplace_snapshots_product_id_recorded_at`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN product_id TO variant_id`.execute(db);

  // ── 4. Backfill marketplace_product_variants ────────────────────────────────
  // Elect a canonical marketplace_products.id per (marketplace, external_id) — the
  // earliest row by (created_at, id). Postgres has no native min(uuid) aggregate,
  // so we use array_agg(id ORDER BY ...)[1] to pick deterministically.
  //
  // After this INSERT there is one variant row per OLD marketplace_products row,
  // and the snapshots that used to reference marketplace_products.id now reference
  // marketplace_product_variants.id via the variant_id column (identical values).
  await sql`
    WITH canonical AS (
      SELECT marketplace, external_id,
             (array_agg(id ORDER BY created_at, id))[1] AS canonical_id
      FROM marketplace_products
      GROUP BY marketplace, external_id
    )
    INSERT INTO marketplace_product_variants
      (id, marketplace_product_id, printing_id, finish, language, created_at, updated_at)
    SELECT
      mp.id,
      c.canonical_id,
      mp.printing_id,
      p.finish,
      mp.language,
      mp.created_at,
      mp.updated_at
    FROM marketplace_products mp
    JOIN printings p ON p.id = mp.printing_id
    JOIN canonical c ON c.marketplace = mp.marketplace AND c.external_id = mp.external_id
  `.execute(db);

  // ── 5. Drop non-canonical marketplace_products rows ────────────────────────
  // Only the canonical row per (marketplace, external_id) survives at the
  // product level. The others still exist as variant rows (step 4) with ids
  // that point back to the canonical product.
  await sql`
    DELETE FROM marketplace_products
    WHERE id NOT IN (
      SELECT (array_agg(id ORDER BY created_at, id))[1]
      FROM marketplace_products
      GROUP BY marketplace, external_id
    )
  `.execute(db);

  // ── 6. Drop old marketplace_products FKs / uniques / columns ───────────────
  await sql`ALTER TABLE marketplace_products DROP CONSTRAINT marketplace_sources_marketplace_printing_id_key`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_products DROP CONSTRAINT marketplace_sources_printing_id_fkey`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS idx_marketplace_sources_printing_id`.execute(db);

  await db.schema.alterTable("marketplace_products").dropColumn("printing_id").execute();
  await db.schema.alterTable("marketplace_products").dropColumn("language").execute();

  await db.schema
    .alterTable("marketplace_products")
    .addUniqueConstraint("marketplace_products_marketplace_external_id_key", [
      "marketplace",
      "external_id",
    ])
    .execute();

  // ── 7. Add new FKs on variants and snapshots ───────────────────────────────
  await sql`
    ALTER TABLE marketplace_product_variants
      ADD CONSTRAINT marketplace_product_variants_product_id_fkey
      FOREIGN KEY (marketplace_product_id) REFERENCES marketplace_products(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_product_variants
      ADD CONSTRAINT marketplace_product_variants_printing_id_fkey
      FOREIGN KEY (printing_id) REFERENCES printings(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_ignored_variants
      ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey
      FOREIGN KEY (marketplace_product_id) REFERENCES marketplace_products(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_snapshots
      ADD CONSTRAINT marketplace_snapshots_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES marketplace_product_variants(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_snapshots
      ADD CONSTRAINT marketplace_snapshots_variant_id_recorded_at_key
      UNIQUE (variant_id, recorded_at)
  `.execute(db);

  await db.schema
    .createIndex("idx_marketplace_snapshots_variant_id_recorded_at")
    .on("marketplace_snapshots")
    .columns(["variant_id", "recorded_at"])
    .execute();

  // ── 8. Split marketplace_ignored_products into L2 / L3 ─────────────────────
  // Heuristic (verified against current data — no ambiguous rows):
  //   - If the same (marketplace, external_id) has at least one mapped product,
  //     the ignore is per-SKU (level 3).
  //   - Otherwise the ignore is whole-product (level 2).
  await sql`
    INSERT INTO marketplace_ignored_variants
      (marketplace_product_id, finish, language, product_name, created_at, updated_at)
    SELECT mp.id, ip.finish, ip.language, ip.product_name, ip.created_at, ip.updated_at
    FROM marketplace_ignored_products ip
    JOIN marketplace_products mp
      ON mp.marketplace = ip.marketplace AND mp.external_id = ip.external_id
  `.execute(db);

  await sql`
    DELETE FROM marketplace_ignored_products ip
    USING marketplace_products mp
    WHERE mp.marketplace = ip.marketplace AND mp.external_id = ip.external_id
  `.execute(db);

  // Collapse any remaining duplicates on (marketplace, external_id) — should be
  // none in practice but belt-and-braces before changing the PK.
  await sql`
    DELETE FROM marketplace_ignored_products a
    USING marketplace_ignored_products b
    WHERE a.marketplace = b.marketplace
      AND a.external_id = b.external_id
      AND a.ctid > b.ctid
  `.execute(db);

  await sql`ALTER TABLE marketplace_ignored_products DROP CONSTRAINT marketplace_ignored_products_pkey`.execute(
    db,
  );
  await db.schema.alterTable("marketplace_ignored_products").dropColumn("finish").execute();
  await db.schema.alterTable("marketplace_ignored_products").dropColumn("language").execute();

  await sql`
    ALTER TABLE marketplace_ignored_products
      ADD PRIMARY KEY (marketplace, external_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── 1. Fold ignored_variants back into ignored_products ───────────────────
  // Must happen before we drop marketplace_ignored_products' PK and collapse
  // marketplace_products shape — the ignored_variants rows need the canonical
  // parent product to resolve (marketplace, external_id).
  await db.schema
    .alterTable("marketplace_ignored_products")
    .addColumn("finish", "text")
    .addColumn("language", "text", (col) => col.defaultTo("EN"))
    .execute();

  await sql`ALTER TABLE marketplace_ignored_products DROP CONSTRAINT marketplace_ignored_products_pkey`.execute(
    db,
  );

  // Existing L2 rows get a placeholder finish/language to fit the old PK.
  await sql`UPDATE marketplace_ignored_products SET finish = 'normal', language = 'EN'`.execute(db);

  await sql`
    INSERT INTO marketplace_ignored_products
      (marketplace, external_id, finish, language, product_name, created_at, updated_at)
    SELECT mp.marketplace, mp.external_id, iv.finish, iv.language, iv.product_name, iv.created_at, iv.updated_at
    FROM marketplace_ignored_variants iv
    JOIN marketplace_products mp ON mp.id = iv.marketplace_product_id
    ON CONFLICT DO NOTHING
  `.execute(db);

  await sql`ALTER TABLE marketplace_ignored_products ALTER COLUMN finish SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_ignored_products ALTER COLUMN language SET NOT NULL`.execute(
    db,
  );

  await sql`
    ALTER TABLE marketplace_ignored_products
      ADD PRIMARY KEY (marketplace, external_id, finish, language)
  `.execute(db);

  // ── 2. Re-add old marketplace_products columns (nullable for backfill) ────
  await db.schema
    .alterTable("marketplace_products")
    .addColumn("printing_id", "uuid")
    .addColumn("language", "text", (col) => col.defaultTo("EN"))
    .execute();

  await sql`ALTER TABLE marketplace_products DROP CONSTRAINT marketplace_products_marketplace_external_id_key`.execute(
    db,
  );

  // ── 3. UPDATE canonical rows in place ─────────────────────────────────────
  // Each canonical marketplace_products.id matches exactly one variant (the
  // variant whose id == marketplace_product_id). Populate printing_id/language
  // from that variant so the canonical row matches the old shape.
  await sql`
    UPDATE marketplace_products mp
    SET printing_id = mpv.printing_id, language = mpv.language
    FROM marketplace_product_variants mpv
    WHERE mpv.id = mp.id
  `.execute(db);

  // ── 4. INSERT new rows for non-canonical variants ─────────────────────────
  // A "non-canonical" variant is one where its id differs from its parent
  // product id (i.e. it represents a row that used to exist as its own
  // marketplace_products row before the up() migration collapsed it).
  await sql`
    INSERT INTO marketplace_products
      (id, marketplace, external_id, group_id, product_name, printing_id, language, created_at, updated_at)
    SELECT
      mpv.id,
      mp.marketplace,
      mp.external_id,
      mp.group_id,
      mp.product_name,
      mpv.printing_id,
      mpv.language,
      mpv.created_at,
      mpv.updated_at
    FROM marketplace_product_variants mpv
    JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
    WHERE mpv.id <> mpv.marketplace_product_id
  `.execute(db);

  // ── 5. Drop FKs that point at variants and rename snapshot column back ────
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_variant_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_snapshots DROP CONSTRAINT marketplace_snapshots_variant_id_recorded_at_key`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS idx_marketplace_snapshots_variant_id_recorded_at`.execute(db);

  await sql`ALTER TABLE marketplace_snapshots RENAME COLUMN variant_id TO product_id`.execute(db);

  await sql`
    ALTER TABLE marketplace_snapshots
      ADD CONSTRAINT marketplace_snapshots_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES marketplace_products(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_snapshots
      ADD CONSTRAINT marketplace_snapshots_product_id_recorded_at_key
      UNIQUE (product_id, recorded_at)
  `.execute(db);

  await db.schema
    .createIndex("idx_marketplace_snapshots_product_id_recorded_at")
    .on("marketplace_snapshots")
    .columns(["product_id", "recorded_at"])
    .execute();

  // ── 6. Re-enable marketplace_products old constraints ─────────────────────
  await sql`ALTER TABLE marketplace_products ALTER COLUMN printing_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_products ALTER COLUMN language SET NOT NULL`.execute(db);

  await sql`
    ALTER TABLE marketplace_products
      ADD CONSTRAINT marketplace_sources_printing_id_fkey
      FOREIGN KEY (printing_id) REFERENCES printings(id)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_products
      ADD CONSTRAINT marketplace_sources_marketplace_printing_id_key
      UNIQUE (marketplace, printing_id)
  `.execute(db);

  await db.schema
    .createIndex("idx_marketplace_sources_printing_id")
    .on("marketplace_products")
    .column("printing_id")
    .execute();

  // ── 7. Drop the new tables ────────────────────────────────────────────────
  await db.schema.dropTable("marketplace_ignored_variants").execute();
  await db.schema.dropTable("marketplace_product_variants").execute();
}
