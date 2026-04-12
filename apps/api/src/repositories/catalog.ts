import type { Domain, SuperType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardBansTable,
  CardErrataTable,
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

/** Card errata row returned by the catalog. */
type CatalogCardErrataRow = Pick<
  Selectable<CardErrataTable>,
  "cardId" | "correctedRulesText" | "correctedEffectText" | "source" | "sourceUrl" | "effectiveDate"
>;

/** Set columns returned by the catalog. */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name" | "releasedAt" | "setType">;

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
    /** @returns All sets ordered by their display position. */
    sets(): Promise<CatalogSetRow[]> {
      return db
        .selectFrom("sets")
        .select(["id", "slug", "name", "releasedAt", "setType"])
        .orderBy("sortOrder")
        .execute();
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

    /** @returns All card errata (one per card at most). */
    cardErrata(): Promise<CatalogCardErrataRow[]> {
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .execute();
    },

    /** @returns Active bans for a set of cards. */
    cardBansByCardIds(cardIds: string[]): Promise<CatalogCardBanRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
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
        .where("cardBans.cardId", "in", cardIds)
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns Errata for a set of cards. */
    cardErrataByCardIds(cardIds: string[]): Promise<CatalogCardErrataRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .where("cardId", "in", cardIds)
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
        .orderBy("printings.shortCode")
        .orderBy("printings.finish", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        cardId: row.cardId,
        setId: row.setId,
        shortCode: row.shortCode,
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
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printingId", "face", imageUrl("ci").as("url")])
        .where("isActive", "=", true)
        .where(sql`${imageUrl("ci")}`, "is not", null)
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

    /** @returns A single card by slug, or `undefined` if not found. */
    cardBySlug(slug: string): Promise<CatalogCardRow | undefined> {
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
          "tags",
          "comment",
          domainsArray("cards.id").as("domains"),
          superTypesArray("cards.id").as("superTypes"),
        ])
        .where("slug", "=", slug)
        .executeTakeFirst() as Promise<CatalogCardRow | undefined>;
    },

    /**
     * @returns All printings for a given card ID, English first so that
     * `printings[0]` is the canonical printing for SSR meta tags and the UI's
     * default selected printing.
     */
    async printingsByCardId(cardId: string): Promise<CatalogPrintingRow[]> {
      const rows = await db
        .selectFrom("printings")
        .leftJoin("promoTypes", "promoTypes.id", "printings.promoTypeId")
        .select([
          "printings.id",
          "printings.cardId",
          "printings.setId",
          "printings.shortCode",
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
        .where("printings.cardId", "=", cardId)
        .orderBy(sql`(printings.language = 'EN') DESC`)
        .orderBy("printings.setId")
        .orderBy("printings.shortCode")
        .orderBy("printings.finish", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        cardId: row.cardId,
        setId: row.setId,
        shortCode: row.shortCode,
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

    /** @returns Printing images for a given card's printings. */
    printingImagesByCardId(cardId: string): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .select(["printingImages.printingId", "printingImages.face", imageUrl("ci").as("url")])
        .where("printings.cardId", "=", cardId)
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageUrl("ci")}`, "is not", null)
        .orderBy("printingImages.printingId")
        .orderBy("printingImages.face")
        .execute() as Promise<CatalogPrintingImageRow[]>;
    },

    /** @returns Active bans for a single card. */
    cardBansByCardId(cardId: string): Promise<CatalogCardBanRow[]> {
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
        .where("cardBans.cardId", "=", cardId)
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns Errata for a single card, or `undefined`. */
    cardErrataByCardId(cardId: string): Promise<CatalogCardErrataRow | undefined> {
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .where("cardId", "=", cardId)
        .executeTakeFirst();
    },

    /** @returns Sets matching the given IDs. */
    setsByIds(ids: string[]): Promise<CatalogSetRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("sets")
        .select(["id", "slug", "name", "releasedAt", "setType"])
        .where("id", "in", ids)
        .orderBy("sortOrder")
        .execute();
    },

    /** @returns A single set by slug, or `undefined`. */
    setBySlug(slug: string): Promise<CatalogSetRow | undefined> {
      return db
        .selectFrom("sets")
        .select(["id", "slug", "name", "releasedAt", "setType"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** @returns All printings for a given set ID. */
    async printingsBySetId(setId: string): Promise<CatalogPrintingRow[]> {
      const rows = await db
        .selectFrom("printings")
        .leftJoin("promoTypes", "promoTypes.id", "printings.promoTypeId")
        .select([
          "printings.id",
          "printings.cardId",
          "printings.setId",
          "printings.shortCode",
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
        .where("printings.setId", "=", setId)
        .orderBy("printings.shortCode")
        .orderBy("printings.finish", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        cardId: row.cardId,
        setId: row.setId,
        shortCode: row.shortCode,
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

    /** @returns Cards matching the given IDs. */
    cardsByIds(ids: string[]): Promise<CatalogCardRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
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
          "tags",
          "comment",
          domainsArray("cards.id").as("domains"),
          superTypesArray("cards.id").as("superTypes"),
        ])
        .where("id", "in", ids)
        .orderBy("name")
        .execute() as Promise<CatalogCardRow[]>;
    },

    /** @returns Printing images for a given set's printings. */
    printingImagesBySetId(setId: string): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .select(["printingImages.printingId", "printingImages.face", imageUrl("ci").as("url")])
        .where("printings.setId", "=", setId)
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageUrl("ci")}`, "is not", null)
        .orderBy("printingImages.printingId")
        .orderBy("printingImages.face")
        .execute() as Promise<CatalogPrintingImageRow[]>;
    },

    /** @returns A cover image URL per set (first available printing image). */
    async setCoverImages(): Promise<Map<string, string>> {
      const rows = await db
        .selectFrom("printings")
        .innerJoin("printingImages", "printingImages.printingId", "printings.id")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printings.setId", imageUrl("ci").as("url")])
        .where("printingImages.isActive", "=", true)
        .where("printingImages.face", "=", "front")
        .where(sql`${imageUrl("ci")}`, "is not", null)
        .distinctOn("printings.setId")
        .orderBy("printings.setId")
        .orderBy("printings.shortCode")
        .execute();
      return new Map(rows.filter((r) => r.url !== null).map((r) => [r.setId, r.url as string]));
    },

    /** @returns Distinct card count in a set. */
    async setCardCount(setId: string): Promise<number> {
      const result = await db
        .selectFrom("printings")
        .select(sql<string>`COUNT(DISTINCT "card_id")`.as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /** @returns Total printing count in a set. */
    async setPrintingCount(setId: string): Promise<number> {
      const result = await db
        .selectFrom("printings")
        .select(sql<string>`COUNT(*)`.as("count"))
        .where("setId", "=", setId)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * Card count and printing count per set, in a single query.
     *
     * @returns A map from set ID to `{ cardCount, printingCount }`.
     */
    async setCountsAll(): Promise<Map<string, { cardCount: number; printingCount: number }>> {
      const rows = await db
        .selectFrom("printings")
        .select([
          "setId",
          sql<string>`COUNT(DISTINCT "card_id")`.as("cardCount"),
          sql<string>`COUNT(*)`.as("printingCount"),
        ])
        .groupBy("setId")
        .execute();
      return new Map(
        rows.map((r) => [
          r.setId,
          { cardCount: Number(r.cardCount), printingCount: Number(r.printingCount) },
        ]),
      );
    },

    /** @returns All card sitemap entries (slug + updatedAt). */
    async allCardSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("cards")
        .select(["slug", "updatedAt"])
        .orderBy("name")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    /** @returns All set sitemap entries (slug + updatedAt). */
    async allSetSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["slug", "updatedAt"])
        .orderBy("sortOrder")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },
  };
}
