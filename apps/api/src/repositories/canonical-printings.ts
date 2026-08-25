import { WellKnown } from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { imageId, joinFrontImage } from "./query-helpers.js";

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
  imageId: string | null;
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
 */
export function canonicalPrintingsRepo(db: Kysely<Database>) {
  function baseQuery() {
    return db.selectFrom("printings as p").innerJoin("sets as s", "s.id", "p.setId");
  }

  /**
   * Appends canonical sort order to a query. Must be called AFTER the
   * DISTINCT ON column's leading ORDER BY (PostgreSQL requires the
   * DISTINCT ON expression to match the first ORDER BY expression).
   */
  function appendCanonicalOrder<T extends ReturnType<typeof baseQuery>>(query: T): T {
    return (
      query
        .orderBy(sql`(p.language = ${WellKnown.language.EN}) DESC`)
        .orderBy("s.sortOrder", "asc")
        .orderBy("p.shortCode", "asc")
        // Empty marker_slugs (unmarked) sorts before marked printings.
        .orderBy(sql`cardinality(p.marker_slugs)`, "asc")
        .orderBy(
          // oxlint-disable-next-line promise/prefer-await-to-then -- Kysely CASE .then(), not Promise
          (eb) => eb.case().when("p.finish", "=", WellKnown.finish.NORMAL).then(0).else(1).end(),
          "asc",
        ) as T
    );
  }

  return {
    /**
     * Resolves a short code per deck row: the preferred printing's code when
     * set and existing, otherwise the card's canonical short code, null when
     * neither exists. One entry per input row, in input order.
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
     * Resolves the printing metadata (id, short code, image id) for each deck
     * row: the preferred printing when set, otherwise the card's canonical
     * default. `imageId` is null when the resolved printing has no active
     * front image; the whole row is all nulls except the input pair when
     * neither a preferred nor a canonical printing exists. One entry per
     * input row, in input order.
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
        imageId: string | null;
      }

      const preferredIds = [
        ...new Set(rows.flatMap((r) => (r.preferredPrintingId ? [r.preferredPrintingId] : []))),
      ];
      const preferredMap = new Map<string, PrintingMetaRow>();
      if (preferredIds.length > 0) {
        const preferredRows = await joinFrontImage(db.selectFrom("printings as p"))
          .select(["p.id as printingId", "p.shortCode", imageId("imgf").as("imageId")])
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
        const canonicalRows = await joinFrontImage(db.selectFrom("printingsOrdered as p"))
          .select(["p.cardId", "p.id as printingId", "p.shortCode", imageId("imgf").as("imageId")])
          .where("p.cardId", "in", cardIdsNeedingCanonical)
          .distinctOn("p.cardId")
          .orderBy("p.cardId")
          .orderBy("p.canonicalRank")
          .execute();
        for (const row of canonicalRows) {
          canonicalMap.set(row.cardId, {
            printingId: row.printingId,
            shortCode: row.shortCode,
            imageId: row.imageId,
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
            imageId: null,
          };
        }
        return {
          cardId: row.cardId,
          preferredPrintingId: row.preferredPrintingId,
          resolvedPrintingId: meta.printingId,
          shortCode: meta.shortCode,
          imageId: meta.imageId,
        };
      });
    },
  };
}
