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
          "domains",
          "might",
          "energy",
          "power",
          "keywords",
          "tags",
        ])
        .select((eb) => [
          eb.ref("super_types").as("superTypes"),
          eb.ref("might_bonus").as("mightBonus"),
          eb.ref("rules_text").as("rulesText"),
          eb.ref("effect_text").as("effectText"),
        ])
        .execute();
    },

    /** @returns All printings ordered by set, collector number, finish. */
    printings() {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "slug",
          "card_id",
          "set_id",
          "source_id",
          "collector_number",
          "rarity",
          "art_variant",
          "is_signed",
          "is_promo",
          "finish",
          "artist",
          "public_code",
          "printed_rules_text",
          "printed_effect_text",
          "flavor_text",
          "comment",
        ])
        .orderBy("set_id")
        .orderBy("collector_number")
        .orderBy("finish", "desc")
        .execute();
    },

    /** @returns All active printing images (front and back), ordered by printing then face. */
    printingImages() {
      return db
        .selectFrom("printing_images")
        .select(["printing_id", "face", imageUrl("printing_images").as("url")])
        .where("is_active", "=", true)
        .orderBy("printing_id")
        .orderBy("face")
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

    /** @returns The printing's `id`, or `undefined` if not found. */
    printingById(id: string) {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },
  };
}
