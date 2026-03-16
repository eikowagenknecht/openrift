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

/** Card columns returned by the catalog (excludes normName and timestamps). */
type CatalogCardRow = Omit<Selectable<CardsTable>, "normName" | "createdAt" | "updatedAt">;

/** Printing columns returned by the catalog (excludes timestamps and comment). */
type CatalogPrintingRow = Omit<Selectable<PrintingsTable>, "comment" | "createdAt" | "updatedAt">;

/** Active printing image with resolved URL. */
type CatalogPrintingImageRow = Pick<Selectable<PrintingImagesTable>, "printingId" | "face"> & {
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
      return db.selectFrom("sets").selectAll().orderBy("sortOrder").execute();
    },

    /** @returns All cards (no printings), for building a card lookup. */
    cards(): Promise<CatalogCardRow[]> {
      return db
        .selectFrom("cards")
        .select([
          "id",
          "slug",
          "name",
          "type",
          "superTypes",
          "domains",
          "might",
          "energy",
          "power",
          "mightBonus",
          "keywords",
          "rulesText",
          "effectText",
          "tags",
        ])
        .execute();
    },

    /** @returns All printings ordered by set, collector number, finish. */
    printings(): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "slug",
          "cardId",
          "setId",
          "sourceId",
          "collectorNumber",
          "rarity",
          "artVariant",
          "isSigned",
          "isPromo",
          "finish",
          "artist",
          "publicCode",
          "printedRulesText",
          "printedEffectText",
          "flavorText",
        ])
        .orderBy("setId")
        .orderBy("collectorNumber")
        .orderBy("finish", "desc")
        .execute();
    },

    /** @returns All active printing images (front and back), ordered by printing then face. */
    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .select(["printingId", "face", imageUrl("printingImages").as("url")])
        .where("isActive", "=", true)
        .orderBy("printingId")
        .orderBy("face")
        .execute();
    },

    /** @returns The most recent `updated_at` across sets, cards, and printings. */
    catalogLastModified(): Promise<{ lastModified: Date }> {
      return db
        .selectFrom(
          sql<{ lastModified: Date }>`(
            SELECT MAX(updated_at) AS last_modified FROM sets
            UNION ALL
            SELECT MAX(updated_at) FROM cards
            UNION ALL
            SELECT MAX(updated_at) FROM printings
          )`.as("t"),
        )
        .select(sql<Date>`MAX(t.last_modified)`.as("lastModified"))
        .executeTakeFirstOrThrow();
    },

    /** @returns The printing's `id`, or `undefined` if not found. */
    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },
  };
}
