import type { Kysely } from "kysely";
import { sql } from "kysely";

// `marketplace` is a closed vocabulary everywhere it appears — the `Marketplace`
// union in `packages/shared/src/types/pricing.ts` — but on these three tables it
// was a bare text column. Every other enum-shaped column in the schema carries a
// CHECK that `apps/api/src/db/enum-checks.integration.test.ts` then holds against
// the TypeScript union; these three were invisible to that guard.
//
// `marketplace_products` also had a `<> ''` CHECK, which the vocabulary makes
// redundant, so it goes.
const MARKETPLACE_TABLES = [
  "marketplace_products",
  "marketplace_groups",
  "marketplace_ignored_products",
];

/** @returns The vocabulary constraint name for one table's `marketplace` column. */
function constraintName(table: string): string {
  return `chk_${table}_marketplace`;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of MARKETPLACE_TABLES) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
      ADD CONSTRAINT ${sql.ref(constraintName(table))}
      CHECK (marketplace = ANY (ARRAY['tcgplayer', 'cardmarket', 'cardtrader']))
    `.execute(db);
  }

  await sql`
    ALTER TABLE marketplace_products DROP CONSTRAINT chk_marketplace_products_marketplace_not_empty
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_products
    ADD CONSTRAINT chk_marketplace_products_marketplace_not_empty CHECK (marketplace <> '')
  `.execute(db);

  for (const table of MARKETPLACE_TABLES) {
    await sql`
      ALTER TABLE ${sql.ref(table)} DROP CONSTRAINT ${sql.ref(constraintName(table))}
    `.execute(db);
  }
}
