import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type {
  CardsTable,
  Database,
  PrintingImagesTable,
  PrintingsTable,
  SetsTable,
} from "../db/index.js";

/** Card columns returned by the catalog (excludes norm_name and timestamps). */
type CatalogCard = Omit<Selectable<CardsTable>, "norm_name" | "created_at" | "updated_at">;

/** Printing columns returned by the catalog (excludes timestamps). */
type CatalogPrinting = Omit<Selectable<PrintingsTable>, "created_at" | "updated_at">;

/** Active printing image with resolved URL. */
type CatalogPrintingImage = Pick<Selectable<PrintingImagesTable>, "printing_id" | "face"> & {
  url: string | null;
};

/**
 * Read-only queries for the card catalog (sets + printings + cards).
 *
 * @returns An object with catalog query methods bound to the given `db`.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    /** @returns All sets ordered by their display position. */
    sets(): Promise<Selectable<SetsTable>[]> {
      return db.selectFrom("sets").selectAll().orderBy("sort_order").execute();
    },

    /** @returns All cards (no printings), for building a card lookup. */
    cards(): Promise<CatalogCard[]> {
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

    /** @returns All printings ordered by set, collector number, finish. */
    printings(): Promise<CatalogPrinting[]> {
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
    printingImages(): Promise<CatalogPrintingImage[]> {
      return db
        .selectFrom("printing_images")
        .select(["printing_id", "face", imageUrl("printing_images").as("url")])
        .where("is_active", "=", true)
        .orderBy("printing_id")
        .orderBy("face")
        .execute();
    },

    /** @returns The most recent `updated_at` across sets, cards, and printings. */
    catalogLastModified(): Promise<{ last_modified: Date }> {
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
    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },
  };
}
