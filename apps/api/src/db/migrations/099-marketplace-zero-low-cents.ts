import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_snapshots
      ADD COLUMN zero_low_cents integer,
      ADD CONSTRAINT chk_marketplace_snapshots_zero_low_cents_non_negative
        CHECK (zero_low_cents >= 0)
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_staging
      ADD COLUMN zero_low_cents integer,
      ADD CONSTRAINT chk_marketplace_staging_zero_low_cents_non_negative
        CHECK (zero_low_cents >= 0)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_staging
      DROP CONSTRAINT IF EXISTS chk_marketplace_staging_zero_low_cents_non_negative,
      DROP COLUMN IF EXISTS zero_low_cents
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_snapshots
      DROP CONSTRAINT IF EXISTS chk_marketplace_snapshots_zero_low_cents_non_negative,
      DROP COLUMN IF EXISTS zero_low_cents
  `.execute(db);
}
