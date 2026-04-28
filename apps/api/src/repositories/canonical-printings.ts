import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { toCardImageVariants } from "../utils/card-image.js";
import { imageUrl } from "./query-helpers.js";

interface CanonicalShortCode {
  cardId: string;
  shortCode: string;
}

/** Input row for per-row short code resolution. */
interface DeckRowForShortCode {
  cardId: string;
  preferredPrintingId: string | null;
}

/** A row's resolved short code; `shortCode` is null when neither the preferred printing nor any canonical printing exists. */
interface ResolvedRowShortCode extends DeckRowForShortCode {
  shortCode: string | null;
}

/**
 * Resolved printing metadata for a deck row — used by the public share-deck
 * endpoint to denormalize the payload so the share page SSRs without the
 * global catalog. Every field below the input pair is `null` when the card
 * has no usable printing (no preferred and no canonical); individual URL
 * fields can also be null when the resolved printing has no active front image.
 */
interface ResolvedRowPrintingMeta extends DeckRowForShortCode {
  resolvedPrintingId: string | null;
  shortCode: string | null;
  thumbnailUrl: string | null;
  fullImageUrl: string | null;
}

/**
 * Bidirectional resolver between card UUIDs and canonical short codes.
 *
 * A "canonical" printing is determined by a simple sort:
 *   1. EN language preferred (falls back to other languages)
 *   2. Set sort order (ascending)
 *   3. Short code (alphabetical — picks base variant over alt-art/overnumbered)
 *   4. Non-promo first
 *   5. Normal finish before foil
 *
 * @returns An object with resolver methods bound to the given `db`.
 */
export function canonicalPrintingsRepo(db: Kysely<Database>) {
  /**
   * Base query: printings joined to sets.
   * @returns A query builder ready for further chaining.
   */
  function baseQuery() {
    return db.selectFrom("printings as p").innerJoin("sets as s", "s.id", "p.setId");
  }

  /**
   * Appends canonical sort order to a query. Must be called AFTER the
   * DISTINCT ON column's leading ORDER BY (PostgreSQL requires the
   * DISTINCT ON expression to match the first ORDER BY expression).
   * @returns The query with canonical ordering appended.
   */
  function appendCanonicalOrder<T extends ReturnType<typeof baseQuery>>(query: T): T {
    return (
      query
        .orderBy(sql`(p.language = 'EN') DESC`)
        .orderBy("s.sortOrder", "asc")
        .orderBy("p.shortCode", "asc")
        // Empty marker_slugs (unmarked) sorts before marked printings.
        .orderBy(sql`cardinality(p.marker_slugs)`, "asc")
        .orderBy(
          // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then) -- Kysely CASE .then(), not Promise
          (eb) => eb.case().when("p.finish", "=", "normal").then(0).else(1).end(),
          "asc",
        ) as T
    );
  }

  return {
    /**
     * Maps card UUIDs to their canonical short codes.
     *
     * @returns One entry per card that has a resolvable printing. Cards with no
     *   matching printing at all are omitted from the result.
     */
    async canonicalShortCodesByCardIds(cardIds: string[]): Promise<CanonicalShortCode[]> {
      if (cardIds.length === 0) {
        return [];
      }

      const rows = await appendCanonicalOrder(
        baseQuery()
          .select(["p.cardId", "p.shortCode"])
          .where("p.cardId", "in", cardIds)
          .distinctOn("p.cardId")
          .orderBy("p.cardId"),
      ).execute();

      return rows;
    },

    /**
     * Resolves a short code per deck row. If a row has a preferredPrintingId,
     * uses that printing's short code; otherwise falls back to the card's
     * canonical short code.
     *
     * @returns One entry per input row in the same order, with `shortCode` null
     *   when neither the preferred printing nor any canonical printing exists.
     */
    async shortCodesForRows(rows: DeckRowForShortCode[]): Promise<ResolvedRowShortCode[]> {
      if (rows.length === 0) {
        return [];
      }

      const preferredIds = [
        ...new Set(rows.flatMap((r) => (r.preferredPrintingId ? [r.preferredPrintingId] : []))),
      ];
      const preferredMap = new Map<string, string>();
      if (preferredIds.length > 0) {
        const preferredRows = await db
          .selectFrom("printings")
          .select(["id", "shortCode"])
          .where("id", "in", preferredIds)
          .execute();
        for (const row of preferredRows) {
          preferredMap.set(row.id, row.shortCode);
        }
      }

      const cardIdsNeedingCanonical = [
        ...new Set(
          rows
            .filter((r) => !r.preferredPrintingId || !preferredMap.has(r.preferredPrintingId))
            .map((r) => r.cardId),
        ),
      ];
      const canonicalMap = new Map<string, string>();
      if (cardIdsNeedingCanonical.length > 0) {
        const canonicalRows = await appendCanonicalOrder(
          baseQuery()
            .select(["p.cardId", "p.shortCode"])
            .where("p.cardId", "in", cardIdsNeedingCanonical)
            .distinctOn("p.cardId")
            .orderBy("p.cardId"),
        ).execute();
        for (const row of canonicalRows) {
          canonicalMap.set(row.cardId, row.shortCode);
        }
      }

      return rows.map((row) => {
        const fromPreferred = row.preferredPrintingId
          ? preferredMap.get(row.preferredPrintingId)
          : undefined;
        return {
          cardId: row.cardId,
          preferredPrintingId: row.preferredPrintingId,
          shortCode: fromPreferred ?? canonicalMap.get(row.cardId) ?? null,
        };
      });
    },

    /**
     * Resolves the printing metadata (id, short code, image URLs) for each
     * deck row. For rows with a `preferredPrintingId`, uses that printing;
     * otherwise falls back to the card's canonical default (same ordering as
     * `canonicalShortCodesByCardIds`). URLs can be null when the resolved
     * printing has no active front image; the whole row is "all nulls except
     * the input pair" when neither a preferred nor a canonical printing
     * exists.
     *
     * @returns One entry per input row, in input order.
     */
    async resolvePrintingMetaForRows(
      rows: DeckRowForShortCode[],
    ): Promise<ResolvedRowPrintingMeta[]> {
      if (rows.length === 0) {
        return [];
      }

      interface PrintingMetaRow {
        printingId: string;
        shortCode: string;
        imageBase: string | null;
      }

      const toVariants = (imageBase: string | null) => {
        if (!imageBase) {
          return { thumbnailUrl: null, fullImageUrl: null };
        }
        const variants = toCardImageVariants(imageBase);
        return { thumbnailUrl: variants.thumbnail, fullImageUrl: variants.full };
      };

      const preferredIds = [
        ...new Set(rows.flatMap((r) => (r.preferredPrintingId ? [r.preferredPrintingId] : []))),
      ];
      const preferredMap = new Map<string, PrintingMetaRow>();
      if (preferredIds.length > 0) {
        const preferredRows = await db
          .selectFrom("printings as p")
          .leftJoin("printingImages as pi", (join) =>
            join
              .onRef("pi.printingId", "=", "p.id")
              .on("pi.face", "=", "front")
              .on("pi.isActive", "=", true),
          )
          .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
          .select(["p.id as printingId", "p.shortCode", imageUrl("imgf").as("imageBase")])
          .where("p.id", "in", preferredIds)
          .execute();
        for (const row of preferredRows) {
          preferredMap.set(row.printingId, row as PrintingMetaRow);
        }
      }

      const cardIdsNeedingCanonical = [
        ...new Set(
          rows
            .filter((r) => !r.preferredPrintingId || !preferredMap.has(r.preferredPrintingId))
            .map((r) => r.cardId),
        ),
      ];
      const canonicalMap = new Map<string, PrintingMetaRow>();
      if (cardIdsNeedingCanonical.length > 0) {
        // Use the `printings_ordered` view (canonicalRank pre-computed) instead
        // of appendCanonicalOrder so the left-joined image tables don't break
        // appendCanonicalOrder's generic constraint on the query shape.
        const canonicalRows = await db
          .selectFrom("printingsOrdered as p")
          .leftJoin("printingImages as pi", (join) =>
            join
              .onRef("pi.printingId", "=", "p.id")
              .on("pi.face", "=", "front")
              .on("pi.isActive", "=", true),
          )
          .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
          .select([
            "p.cardId",
            "p.id as printingId",
            "p.shortCode",
            imageUrl("imgf").as("imageBase"),
          ])
          .where("p.cardId", "in", cardIdsNeedingCanonical)
          .distinctOn("p.cardId")
          .orderBy("p.cardId")
          .orderBy("p.canonicalRank")
          .execute();
        for (const row of canonicalRows) {
          canonicalMap.set(row.cardId, {
            printingId: row.printingId,
            shortCode: row.shortCode,
            imageBase: row.imageBase,
          });
        }
      }

      return rows.map((row) => {
        const fromPreferred = row.preferredPrintingId
          ? preferredMap.get(row.preferredPrintingId)
          : undefined;
        const meta = fromPreferred ?? canonicalMap.get(row.cardId);
        if (!meta) {
          return {
            cardId: row.cardId,
            preferredPrintingId: row.preferredPrintingId,
            resolvedPrintingId: null,
            shortCode: null,
            thumbnailUrl: null,
            fullImageUrl: null,
          };
        }
        const { thumbnailUrl, fullImageUrl } = toVariants(meta.imageBase);
        return {
          cardId: row.cardId,
          preferredPrintingId: row.preferredPrintingId,
          resolvedPrintingId: meta.printingId,
          shortCode: meta.shortCode,
          thumbnailUrl,
          fullImageUrl,
        };
      });
    },
  };
}
