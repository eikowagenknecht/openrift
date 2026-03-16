import type { Kysely } from "kysely";

import { imageUrl, selectPrintingWithCard } from "../db-helpers.js";
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

    /** @returns All printings joined with their card and front-face image, ordered by set, collector number, finish. */
    printingsWithCards() {
      return selectPrintingWithCard(db)
        .innerJoin("sets as s", "s.id", "p.set_id")
        .select([
          "p.id as printing_id",
          "p.slug as printing_slug",
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
          "c.id as card_id",
          "c.slug as card_slug",
          "c.name",
          "c.type",
          "c.super_types",
          "c.domains",
          "c.might",
          "c.energy",
          "c.power",
          "c.might_bonus",
          "c.keywords",
          "c.rules_text",
          "c.effect_text",
          "c.tags",
          "s.slug as set_slug",
        ])
        .orderBy("p.set_id")
        .orderBy("p.collector_number")
        .orderBy("p.finish", "desc")
        .execute();
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
