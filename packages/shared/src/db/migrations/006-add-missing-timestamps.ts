import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Staging tables: add updated_at (rows are upserted on re-import)
  await db.schema
    .alterTable("tcgplayer_staging")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .alterTable("cardmarket_staging")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Admins: add updated_at for consistency
  await db.schema
    .alterTable("admins")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Snapshot tables: add created_at + updated_at for debugging/consistency
  await db.schema
    .alterTable("tcgplayer_snapshots")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .alterTable("tcgplayer_snapshots")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .alterTable("cardmarket_snapshots")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .alterTable("cardmarket_snapshots")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("cardmarket_snapshots").dropColumn("updated_at").execute();
  await db.schema.alterTable("cardmarket_snapshots").dropColumn("created_at").execute();
  await db.schema.alterTable("tcgplayer_snapshots").dropColumn("updated_at").execute();
  await db.schema.alterTable("tcgplayer_snapshots").dropColumn("created_at").execute();
  await db.schema.alterTable("admins").dropColumn("updated_at").execute();
  await db.schema.alterTable("cardmarket_staging").dropColumn("updated_at").execute();
  await db.schema.alterTable("tcgplayer_staging").dropColumn("updated_at").execute();
}
