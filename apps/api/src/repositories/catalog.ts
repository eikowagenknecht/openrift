import type { Domain, SuperType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardBansTable,
  CardsTable,
  Database,
  PrintingImagesTable,
  PrintingsTable,
  SetsTable,
} from "../db/index.js";
import { domainsArray, imageUrl, superTypesArray } from "./query-helpers.js";

/** Card columns returned by the catalog (excludes normName and timestamps). */
type CatalogCardRow = Omit<Selectable<CardsTable>, "normName" | "createdAt" | "updatedAt"> & {
  domains: Domain[];
  superTypes: SuperType[];
};

/** Active ban row returned by the catalog. */
type CatalogCardBanRow = Pick<
  Selectable<CardBansTable>,
  "cardId" | "formatId" | "bannedAt" | "reason"
> & { formatName: string };

/** Set columns returned by the catalog (id, slug, name only). */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name">;

/** Active printing image with resolved URL (null URLs filtered at query level). */
type CatalogPrintingImageRow = Pick<Selectable<PrintingImagesTable>, "printingId" | "face"> & {
  url: string;
};

/** Printing row returned by the catalog, with promoType resolved from the join. */
type CatalogPrintingRow = Omit<
  Selectable<PrintingsTable>,
  "comment" | "createdAt" | "updatedAt" | "promoTypeId"
> & {
  printedName: string | null;
  language: string;
  promoType: { id: string; slug: string; label: string } | null;
};

/**
 * Read-only queries for the card catalog (sets + printings + cards).
 *
 * The `.select()` columns in each method define the public API contract —
 * the catalog route spreads these rows directly into the response. Only
 * select columns that are safe to expose to clients.
 *
 * @returns An object with catalog query methods bound to the given `db`.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    /** @returns All languages ordered by their display position. */
    languages() {
      return db.selectFrom("languages").select(["code", "name"]).orderBy("sortOrder").execute();
    },

    /** @returns All sets ordered by their display position. */
    sets(): Promise<CatalogSetRow[]> {
      return db.selectFrom("sets").select(["id", "slug", "name"]).orderBy("sortOrder").execute();
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
          "might",
          "energy",
          "power",
          "mightBonus",
          "keywords",
          "rulesText",
          "effectText",
          "tags",
          "comment",
          domainsArray("cards.id").as("domains"),
          superTypesArray("cards.id").as("superTypes"),
        ])
        .orderBy("name")
        .execute() as Promise<CatalogCardRow[]>;
    },

    /** @returns All active card bans (not yet unbanned), with format display name. */
    cardBans(): Promise<CatalogCardBanRow[]> {
      return db
        .selectFrom("cardBans")
        .innerJoin("formats", "formats.id", "cardBans.formatId")
        .select([
          "cardBans.cardId",
          "cardBans.formatId",
          "cardBans.bannedAt",
          "cardBans.reason",
          "formats.name as formatName",
        ])
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns All printings ordered by set, collector number, finish, with promoType resolved. */
    async printings(): Promise<CatalogPrintingRow[]> {
      const rows = await db
        .selectFrom("printings")
        .leftJoin("promoTypes", "promoTypes.id", "printings.promoTypeId")
        .select([
          "printings.id",
          "printings.cardId",
          "printings.setId",
          "printings.shortCode",
          "printings.collectorNumber",
          "printings.rarity",
          "printings.artVariant",
          "printings.isSigned",
          "printings.finish",
          "printings.artist",
          "printings.publicCode",
          "printings.printedRulesText",
          "printings.printedEffectText",
          "printings.flavorText",
          "printings.printedName",
          "printings.language",
          "promoTypes.id as promoTypeId",
          "promoTypes.slug as promoTypeSlug",
          "promoTypes.label as promoTypeLabel",
        ])
        .orderBy("printings.setId")
        .orderBy("printings.collectorNumber")
        .orderBy("printings.finish", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        cardId: row.cardId,
        setId: row.setId,
        shortCode: row.shortCode,
        collectorNumber: row.collectorNumber,
        rarity: row.rarity,
        artVariant: row.artVariant,
        isSigned: row.isSigned,
        finish: row.finish,
        artist: row.artist,
        publicCode: row.publicCode,
        printedRulesText: row.printedRulesText,
        printedEffectText: row.printedEffectText,
        flavorText: row.flavorText,
        printedName: row.printedName,
        language: row.language,
        promoType: row.promoTypeId
          ? { id: row.promoTypeId, slug: row.promoTypeSlug ?? "", label: row.promoTypeLabel ?? "" }
          : null,
      }));
    },

    /** @returns All active printing images (front and back), ordered by printing then face. */
    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .select(["printingId", "face", imageUrl("printingImages").as("url")])
        .where("isActive", "=", true)
        .where(sql`${imageUrl("printingImages")}`, "is not", null)
        .orderBy("printingId")
        .orderBy("face")
        .execute() as Promise<CatalogPrintingImageRow[]>;
    },

    /** @returns The total number of copies across all users. */
    async totalCopies(): Promise<number> {
      const result = await db
        .selectFrom("copies")
        .select(sql<string>`COUNT(*)`.as("count"))
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /** @returns The card's `id`, or `undefined` if not found. */
    cardById(id: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("id", "=", id).executeTakeFirst();
    },

    /** @returns The printing's `id`, or `undefined` if not found. */
    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },
  };
}
