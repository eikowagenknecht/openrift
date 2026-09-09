import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * better-auth 1.7.3 keys accounts by `(provider_id, account_id)` again and
 * never writes the `issuer` column migration 260 added for 1.7.0-1.7.2, so a
 * NOT NULL column rejects every sign-up and account link. Relaxing the column
 * and dropping the compound index is the vendor's Postgres path:
 * https://www.better-auth.com/docs/guides/1-7-upgrade-guide
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE accounts ALTER COLUMN issuer DROP NOT NULL`.execute(db);
  await sql`DROP INDEX uq_accounts_issuer_account`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE accounts SET issuer = CASE
      WHEN provider_id = 'credential' THEN 'local:credential'
      WHEN provider_id = 'google' THEN 'https://accounts.google.com'
      ELSE 'local:oauth:' || provider_id
    END
    WHERE issuer IS NULL
  `.execute(db);
  await sql`ALTER TABLE accounts ALTER COLUMN issuer SET NOT NULL`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_accounts_issuer_account ON accounts (issuer, account_id)`.execute(
    db,
  );
}
