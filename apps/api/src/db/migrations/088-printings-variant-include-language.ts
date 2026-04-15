import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();

  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "short_code",
      "art_variant",
      "is_signed",
      "promo_type_id",
      "rarity",
      "finish",
      "language",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("printings").dropConstraint("uq_printings_variant").execute();

  await db.schema
    .alterTable("printings")
    .addUniqueConstraint("uq_printings_variant", [
      "short_code",
      "art_variant",
      "is_signed",
      "promo_type_id",
      "rarity",
      "finish",
    ])
    .execute();
}
