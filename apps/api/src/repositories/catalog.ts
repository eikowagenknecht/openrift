import type { Kysely } from "kysely";
import { sql } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type { Database } from "../db/index.js";

/**
 * Read-only queries for the card catalog (sets + printings + cards).
 *
 * @returns An object with catalog query methods bound to the given `db`.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    /** @returns All sets ordered by their display position. */
    sets() {
      return db.selectFrom("sets").selectAll().orderBy("sort_order").execute();
    },

    /** @returns All cards (no printings), for building a card lookup. */
    cards() {
      return db
        .selectFrom("cards")
        .select([
          "id",
          "slug",
          "name",
          "type",
          "super_types",
          "domains",
          "might",
          "energy",
          "power",
          "might_bonus",
          "keywords",
          "rules_text",
          "effect_text",
          "tags",
        ])
        .execute();
    },

    /** @returns All printings with front-face image and set slug, ordered by set, collector number, finish. */
    printings() {
      return db
        .selectFrom("printings as p")
        .leftJoin("printing_images as pi", (join) =>
          join
            .onRef("pi.printing_id", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.is_active", "=", true),
        )
        .innerJoin("sets as s", "s.id", "p.set_id")
        .select([
          "p.id",
          "p.slug",
          "p.card_id",
          "p.set_id",
          "p.source_id",
          "p.collector_number",
          "p.rarity",
          "p.art_variant",
          "p.is_signed",
          "p.is_promo",
          "p.finish",
          imageUrl("pi").as("image_url"),
          "p.artist",
          "p.public_code",
          "p.printed_rules_text",
          "p.printed_effect_text",
          "p.flavor_text",
          "p.comment",
          "s.slug as set_slug",
        ])
        .orderBy("p.set_id")
        .orderBy("p.collector_number")
        .orderBy("p.finish", "desc")
        .execute();
    },

    /** @returns The most recent `updated_at` across sets, cards, and printings. */
    catalogLastModified() {
      return db
        .selectFrom(
          sql<{ last_modified: Date }>`(
            SELECT MAX(updated_at) AS last_modified FROM sets
            UNION ALL
            SELECT MAX(updated_at) FROM cards
            UNION ALL
            SELECT MAX(updated_at) FROM printings
          )`.as("t"),
        )
        .select(sql<Date>`MAX(t.last_modified)`.as("last_modified"))
        .executeTakeFirstOrThrow();
    },

    /** @returns The printing's `id`, or `undefined` if not found. Accepts UUID or slug. */
    printingByIdOrSlug(param: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where((eb) => eb.or([eb("id", "=", param), eb("slug", "=", param)]))
        .executeTakeFirst();
    },
  };
}
