import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * better-auth 1.7 scopes account identity by an `issuer` namespace: every
 * account row must carry one, and sign-in matches on it. Without the column,
 * password sign-in fails as "invalid email or password" (the runtime filters
 * accounts on `issuer = 'local:credential'` in JS) and social sign-in 500s on
 * the missing column. The 1.6 → 1.7 bump shipped without this migration, which
 * broke sign-in in production.
 *
 * The backfill values are dictated by better-auth's runtime, not chosen here:
 * `local:credential` is `createLocalAccountIssuer("credential")`, the Google
 * URL is hardcoded as that provider's `accountIssuer`, and providers without a
 * verified issuer of their own (Discord today) default to
 * `createOAuthAccountIssuer(providerId)` = `local:oauth:<providerId>`. The
 * ELSE branch matches that default for any provider id, so an unexpected row
 * cannot block the NOT NULL step. (Upstream URI-encodes the provider id; ours
 * are plain slugs, so plain concatenation is identical.)
 *
 * The `(issuer, account_id)` unique index mirrors the index better-auth 1.7
 * declares on the account model. It cannot conflict in existing data: rows
 * were already unique per `(provider_id, account_id)`, and distinct providers
 * map to distinct issuers. That old index stays — provider_id is still
 * required and the invariant still holds.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE accounts ADD COLUMN issuer text`.execute(db);
  await sql`
    UPDATE accounts SET issuer = CASE
      WHEN provider_id = 'credential' THEN 'local:credential'
      WHEN provider_id = 'google' THEN 'https://accounts.google.com'
      ELSE 'local:oauth:' || provider_id
    END
  `.execute(db);
  await sql`ALTER TABLE accounts ALTER COLUMN issuer SET NOT NULL`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_accounts_issuer_account ON accounts (issuer, account_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX uq_accounts_issuer_account`.execute(db);
  await sql`ALTER TABLE accounts DROP COLUMN issuer`.execute(db);
}
