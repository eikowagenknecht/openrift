import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE marketplace_snapshots ALTER COLUMN market_cents DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN market_cents DROP NOT NULL`.execute(db);

  await sql`
    UPDATE marketplace_snapshots
    SET market_cents = NULL
    WHERE product_id IN (
      SELECT id FROM marketplace_products WHERE marketplace = 'cardtrader'
    )
  `.execute(db);

  await sql`UPDATE marketplace_staging SET market_cents = NULL WHERE marketplace = 'cardtrader'`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE marketplace_snapshots
    SET market_cents = low_cents
    WHERE market_cents IS NULL
      AND product_id IN (
        SELECT id FROM marketplace_products WHERE marketplace = 'cardtrader'
      )
  `.execute(db);

  await sql`
    UPDATE marketplace_staging
    SET market_cents = low_cents
    WHERE market_cents IS NULL AND marketplace = 'cardtrader'
  `.execute(db);

  await sql`ALTER TABLE marketplace_snapshots ALTER COLUMN market_cents SET NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN market_cents SET NOT NULL`.execute(db);
}
