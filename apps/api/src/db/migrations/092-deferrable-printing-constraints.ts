import type { Kysely } from "kysely";
import { sql } from "kysely";

// Make the identity/variant uniqueness on `printings` DEFERRABLE INITIALLY
// DEFERRED so that replacing a printing's markers (DELETE + INSERT on
// printing_markers, which the sync trigger turns into intermediate
// marker_slugs = {} on the parent printing) can complete inside a single
// transaction even when a sibling printing shares the same
// (card_id, short_code, finish, language) tuple with empty markers. The check
// runs at commit, after the final marker_slugs value is in place.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printings").dropConstraint("uq_printings_identity").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_identity
      UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language)
  `.execute(db);

  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT uq_printings_variant
      UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language)
  `.execute(db);
}
