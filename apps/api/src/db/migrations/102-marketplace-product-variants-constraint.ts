import type { Kysely } from "kysely";
import { sql } from "kysely";

// Allows a single marketplace product to map to multiple printings for the
// same (finish, language). Cardmarket returns a language-aggregate price that
// can legitimately cover several language variants of the same card — e.g.
// cheapest of EN / ZH — and the user needs to be able to attach one product
// to both printings when that's the case.
//
// The old unique index (marketplace_product_id, finish, language) prevented
// that: the second assignment would conflict and the upsert's DO UPDATE SET
// printing_id replaced the first, silently. The new index adds printing_id,
// so the same product can cover multiple printings while still blocking
// duplicate rows for the same (product, printing, finish, language) tuple.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX marketplace_product_variants_product_finish_language_key`.execute(db);

  await sql`
    CREATE UNIQUE INDEX marketplace_product_variants_product_finish_language_key
      ON marketplace_product_variants (marketplace_product_id, finish, language, printing_id)
      NULLS NOT DISTINCT
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX marketplace_product_variants_product_finish_language_key`.execute(db);

  await sql`
    CREATE UNIQUE INDEX marketplace_product_variants_product_finish_language_key
      ON marketplace_product_variants (marketplace_product_id, finish, language)
      NULLS NOT DISTINCT
  `.execute(db);
}
