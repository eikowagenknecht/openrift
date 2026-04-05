import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── marketplace_staging ──────────────────────────────────────────────────
  await db.schema
    .alterTable("marketplace_staging")
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .execute();

  // Drop old unique and recreate with language
  await sql`
    ALTER TABLE marketplace_staging
      DROP CONSTRAINT marketplace_staging_marketplace_external_id_finish_recorded_at_,
      ADD CONSTRAINT marketplace_staging_marketplace_external_id_finish_language_rec
        UNIQUE (marketplace, external_id, finish, language, recorded_at)
  `.execute(db);

  // ── marketplace_products ─────────────────────────────────────────────────
  await db.schema
    .alterTable("marketplace_products")
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .execute();

  // ── marketplace_ignored_products ─────────────────────────────────────────
  await db.schema
    .alterTable("marketplace_ignored_products")
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .execute();

  // Drop old PK and recreate with language
  await sql`
    ALTER TABLE marketplace_ignored_products
      DROP CONSTRAINT marketplace_ignored_products_pkey,
      ADD PRIMARY KEY (marketplace, external_id, finish, language)
  `.execute(db);

  // ── marketplace_staging_card_overrides ────────���───────────────────────────
  await db.schema
    .alterTable("marketplace_staging_card_overrides")
    .addColumn("language", "text", (col) => col.notNull().defaultTo("EN"))
    .execute();

  // Drop old PK and recreate with language
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT marketplace_staging_card_overrides_pkey,
      ADD PRIMARY KEY (marketplace, external_id, finish, language)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── marketplace_staging_card_overrides ────────────────────────────────────
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT marketplace_staging_card_overrides_pkey,
      ADD PRIMARY KEY (marketplace, external_id, finish)
  `.execute(db);

  await db.schema.alterTable("marketplace_staging_card_overrides").dropColumn("language").execute();

  // ── marketplace_ignored_products ─────────────────────────────────────────
  await sql`
    ALTER TABLE marketplace_ignored_products
      DROP CONSTRAINT marketplace_ignored_products_pkey,
      ADD PRIMARY KEY (marketplace, external_id, finish)
  `.execute(db);

  await db.schema.alterTable("marketplace_ignored_products").dropColumn("language").execute();

  // ─�� marketplace_products ─────────���───────────────────────────────────────
  await db.schema.alterTable("marketplace_products").dropColumn("language").execute();

  // ── marketplace_staging ─────────────────────────��────────────────────────
  await sql`
    ALTER TABLE marketplace_staging
      DROP CONSTRAINT marketplace_staging_marketplace_external_id_finish_language_rec,
      ADD CONSTRAINT marketplace_staging_marketplace_external_id_finish_recorded_at_
        UNIQUE (marketplace, external_id, finish, recorded_at)
  `.execute(db);

  await db.schema.alterTable("marketplace_staging").dropColumn("language").execute();
}
