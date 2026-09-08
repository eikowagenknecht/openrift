import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, NotNull, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PrintingImagesTable, PrintingsTable } from "../../../db/tables/catalog.js";
import { fallbackImageId, imageId } from "../../../repositories/query-helpers.js";

type PrintingCodeRow = Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "publicCode">;

type CatalogPrintingImageRow = Pick<Selectable<PrintingImagesTable>, "printingId" | "face"> & {
  imageId: string;
  credit: string | null;
};

/** One scanner bank reference: a front render plus its label identity. */
export interface ScanReferenceRow {
  imageId: string;
  name: string;
  setSlug: string;
  publicCode: string;
  language: string;
  cardType: string;
  artVariant: string | null;
  isOvernumbered: boolean;
  createdAt: Date;
  /**
   * Min/max serialized marker set over every active front printing sharing
   * this image. Equal means the image's marker set is unanimous; a mismatch
   * means one render serves stamped and unstamped printings and carries no
   * stamp evidence for the scanner's disambiguation.
   */
  markersMin: string;
  markersMax: string;
}

/**
 * Printing row returned by the catalog. Marker metadata (label/description)
 * and distribution channels are resolved separately by the route layer using
 * the catalog's `markersList()` and the distribution-channels repo.
 *
 * `canonicalRank` is the integer sort key from the `printings_ordered` view.
 * Clients sort by this integer and get language-first, set-order, shortCode,
 * non-promo-first, finish-sort-order semantics in one compare. User language
 * preference overrides the language axis post-query.
 *
 * The date columns are omitted on purpose: only the admin printing desk
 * reads them, and this payload carries every printing of every card.
 */
type CatalogPrintingRow = Omit<
  Selectable<PrintingsTable>,
  | "createdAt"
  | "updatedAt"
  | "fallbackImageFileId"
  | "announcedAt"
  | "releasedAt"
  | "releasePrecision"
> & {
  printedName: string | null;
  language: string;
  markerSlugs: string[];
  comment: string | null;
  canonicalRank: number;
  /** See {@link Printing.hasFoilTwin}; from `mv_printing_foil_twins`. */
  hasFoilTwin: boolean;
  /**
   * The pinned substitute's *servable* image id: the raw
   * `fallback_image_file_id` resolved through the same rehosted-or-nothing rule
   * as every other image id (see {@link fallbackImageId}). Null both when
   * nothing is pinned and when the pinned file has no rehosted copy yet.
   */
  fallbackImageId: string | null;
};

/** Selecting from `printings_ordered` (the view) so we get `canonical_rank` too. */
const PRINTING_VIEW_COLUMNS = [
  "printingsOrdered.id",
  "printingsOrdered.cardId",
  "printingsOrdered.setId",
  "printingsOrdered.shortCode",
  "printingsOrdered.rarity",
  "printingsOrdered.artVariant",
  "printingsOrdered.isSigned",
  "printingsOrdered.isOvernumbered",
  "printingsOrdered.finish",
  "printingsOrdered.size",
  "printingsOrdered.artist",
  "printingsOrdered.publicCode",
  "printingsOrdered.printedRulesText",
  "printingsOrdered.printedEffectText",
  "printingsOrdered.flavorText",
  "printingsOrdered.printedName",
  "printingsOrdered.printedYear",
  "printingsOrdered.language",
  "printingsOrdered.markerSlugs",
  "printingsOrdered.comment",
  "printingsOrdered.canonicalRank",
  "printingsOrdered.hasFoilTwin",
  "printingsOrdered.fallbackArtMode",
  fallbackImageId("printingsOrdered"),
] as const;

function selectPrintingImages(db: Kysely<Database>) {
  return db
    .selectFrom("printingImages")
    .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
    .select([
      "printingImages.printingId",
      "printingImages.face",
      imageId("ci").as("imageId"),
      "ci.credit",
    ])
    .where("printingImages.isActive", "=", true)
    .where(sql`${imageId("ci")}`, "is not", null)
    .orderBy("printingImages.printingId")
    .orderBy("printingImages.face")
    .$narrowType<{ imageId: NotNull }>();
}

export function catalogPrintingsRepo(db: Kysely<Database>) {
  return {
    printings(): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    /**
     * Just the two lookup codes per printing, for building a code index. The
     * full `printings()` read carries every printed rules and flavor text on
     * every row, which is orders of magnitude more bytes than a code lookup
     * needs.
     */
    printingCodes(): Promise<PrintingCodeRow[]> {
      return db
        .selectFrom("printings")
        .select(["cardId", "shortCode", "publicCode"])
        .orderBy("shortCode")
        .execute();
    },

    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db).execute();
    },

    async totalCopies(): Promise<number> {
      const result = await db
        .selectFrom("copies")
        .select(sql<string>`COUNT(*)`.as("count"))
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /**
     * `printings[0]` is the canonical default printing for SSR meta tags
     * and the UI's initially-selected printing.
     *
     * The ordering expression mirrors the `printings_ordered` view, but the
     * row_number is computed only over the matching subset so the
     * `idx_printings_card_id` index can be used. `canonicalRank` is therefore
     * per-card monotonic (1, 2, 3 …) — consumers only use it as a within-card
     * tiebreaker, so the smaller values are semantically equivalent.
     */
    printingsByCardId(cardId: string): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .innerJoin("finishes as f", "f.slug", "p.finish")
        .innerJoin("cardSizes as cs", "cs.slug", "p.size")
        .innerJoin("languages as l", "l.code", "p.language")
        .leftJoin("mvPrintingFoilTwins as ft", "ft.printingId", "p.id")
        .select([
          "p.id",
          "p.cardId",
          "p.setId",
          "p.shortCode",
          "p.rarity",
          "p.artVariant",
          "p.isSigned",
          "p.isOvernumbered",
          "p.finish",
          "p.size",
          "p.artist",
          "p.publicCode",
          "p.printedRulesText",
          "p.printedEffectText",
          "p.flavorText",
          "p.printedName",
          "p.printedYear",
          "p.language",
          "p.markerSlugs",
          "p.comment",
          "p.fallbackArtMode",
          fallbackImageId("p"),
          sql<boolean>`(ft.printing_id IS NOT NULL)`.as("hasFoilTwin"),
          sql<number>`(row_number() OVER (
            ORDER BY
              l.sort_order,
              s.sort_order,
              p.short_code,
              array_length(p.marker_slugs, 1) IS NOT NULL,
              COALESCE(
                (SELECT MIN(m.sort_order) FROM markers m
                 WHERE m.slug = ANY(p.marker_slugs)),
                0
              ),
              f.sort_order,
              cs.sort_order
          ))::int`.as("canonicalRank"),
        ])
        .where("p.cardId", "=", cardId)
        .orderBy("canonicalRank")
        .execute();
    },

    printingImagesByCardId(cardId: string): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db)
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .where("printings.cardId", "=", cardId)
        .execute();
    },

    printingsBySetId(setId: string): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.setId", "=", setId)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    printingsByCardIds(cardIds: string[]): Promise<CatalogPrintingRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.cardId", "in", cardIds)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    printingImagesByCardIds(cardIds: string[]): Promise<CatalogPrintingImageRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return selectPrintingImages(db)
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .where("printings.cardId", "in", cardIds)
        .execute();
    },

    printingsByIds(ids: string[]): Promise<CatalogPrintingRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.id", "in", ids)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    printingImagesBySetId(setId: string): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db)
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .where("printings.setId", "=", setId)
        .execute();
    },

    /**
     * Every active front-face render the scanner's embedding bank indexes,
     * with the identity fields the scan labels carry. One row per image file;
     * `createdAt` is the printing image's creation time (the bank watermark
     * is the maximum over the built set).
     */
    scanReferences(): Promise<ScanReferenceRow[]> {
      return (
        db
          .selectFrom("printingImages")
          .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
          .innerJoin("printings", "printings.id", "printingImages.printingId")
          .innerJoin("cards", "cards.id", "printings.cardId")
          .innerJoin("sets", "sets.id", "printings.setId")
          .select([
            imageId("ci").as("imageId"),
            "cards.name",
            "sets.slug as setSlug",
            "printings.publicCode",
            "printings.language",
            "cards.type as cardType",
            "printings.artVariant",
            "printings.isOvernumbered",
            "printingImages.createdAt",
            // Window aggregates run before distinctOn collapses the shared
            // images, so min/max span every printing sharing the render;
            // equal min and max means the image's marker set is unanimous.
            sql<string>`min(array_to_string(printings.marker_slugs, '+')) over (partition by ${imageId("ci")})`.as(
              "markersMin",
            ),
            sql<string>`max(array_to_string(printings.marker_slugs, '+')) over (partition by ${imageId("ci")})`.as(
              "markersMax",
            ),
          ])
          .where("printingImages.face", "=", "front")
          .where("printingImages.isActive", "=", true)
          .where(sql`${imageId("ci")}`, "is not", null)
          // Printings can share one image file; the bank must carry each
          // render exactly once (duplicate keys would crowd the verification
          // shortlist). The printing id breaks ties deterministically.
          .distinctOn(imageId("ci"))
          .orderBy(imageId("ci"))
          .orderBy("printings.id")
          .$narrowType<{ imageId: NotNull }>()
          .execute()
      );
    },

    async setCoverImageIds(): Promise<Map<string, string>> {
      const rows = await db
        .selectFrom("printings")
        .innerJoin("printingImages", "printingImages.printingId", "printings.id")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printings.setId", imageId("ci").as("imageId")])
        .where("printingImages.isActive", "=", true)
        .where("printingImages.face", "=", "front")
        .where(sql`${imageId("ci")}`, "is not", null)
        .distinctOn("printings.setId")
        .orderBy("printings.setId")
        .orderBy(sql`(printings.language = ${WellKnown.language.EN}) DESC`)
        .orderBy("printings.shortCode")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
      return new Map(rows.map((r) => [r.setId, r.imageId]));
    },

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

    markersList(): Promise<
      { id: string; slug: string; label: string; description: string | null }[]
    > {
      return db
        .selectFrom("markers")
        .select(["id", "slug", "label", "description"])
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    printingImagesByPrintingIds(printingIds: string[]): Promise<CatalogPrintingImageRow[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return selectPrintingImages(db)
        .where("printingImages.printingId", "in", printingIds)
        .execute();
    },

    channelDistributedPrintings(): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("printingDistributionChannels as pdc")
              .select(sql`1`.as("one"))
              .whereRef("pdc.printingId", "=", "printingsOrdered.id"),
          ),
        )
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },
  };
}
