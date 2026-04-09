import type { CardType, Domain, SuperType } from "@openrift/shared/types";
import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { domainsArray, superTypesArray } from "./query-helpers.js";

interface CanonicalShortCode {
  cardId: string;
  shortCode: string;
}

interface ResolvedCard {
  shortCode: string;
  cardId: string;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

/**
 * Bidirectional resolver between card UUIDs and canonical short codes.
 *
 * A "canonical" printing is determined by a simple sort:
 *   1. Set sort order (ascending)
 *   2. Short code (alphabetical — picks base variant over alt-art/overnumbered)
 *   3. Non-promo first
 *   4. Normal finish before foil
 * Only EN-language printings are considered.
 *
 * @returns An object with resolver methods bound to the given `db`.
 */
export function canonicalPrintingsRepo(db: Kysely<Database>) {
  /**
   * Base query: EN-language printings joined to sets.
   * @returns A query builder ready for further chaining.
   */
  function baseQuery() {
    return db
      .selectFrom("printings as p")
      .innerJoin("sets as s", "s.id", "p.setId")
      .where("p.language", "=", "EN");
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
        .orderBy("s.sortOrder", "asc")
        .orderBy("p.shortCode", "asc")
        // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then) -- Kysely CASE .then(), not Promise
        .orderBy((eb) => eb.case().when("p.promoTypeId", "is", null).then(0).else(1).end(), "asc")
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
     * Maps short codes to card IDs with card type info (needed for zone inference).
     *
     * @returns One entry per unique short code that resolves to a card.
     */
    async cardIdsByShortCodes(shortCodes: string[]): Promise<ResolvedCard[]> {
      if (shortCodes.length === 0) {
        return [];
      }

      const rows = await appendCanonicalOrder(
        baseQuery()
          .innerJoin("cards as c", "c.id", "p.cardId")
          .select([
            "p.shortCode",
            "p.cardId",
            "c.name as cardName",
            "c.type as cardType",
            domainsArray("c.id").as("domains"),
            superTypesArray("c.id").as("superTypes"),
          ])
          .where("p.shortCode", "in", shortCodes)
          .distinctOn("p.shortCode")
          .orderBy("p.shortCode"),
      ).execute();

      return rows as ResolvedCard[];
    },

    /**
     * Maps "tag, name" pairs to card IDs for text import fallback.
     *
     * Handles cases like "Sett, The Boss" where the DB card name is "The Boss"
     * with tag "Sett". Splits each input on the first comma to extract tag and name.
     *
     * @returns One entry per resolved pair, keyed by the original input name.
     */
    async cardIdsByTagAndName(
      names: string[],
    ): Promise<(ResolvedCard & { originalName: string })[]> {
      // Split each name into tag + card name on the first comma
      const pairs: { original: string; tag: string; name: string }[] = [];
      for (const name of names) {
        const commaIndex = name.indexOf(",");
        if (commaIndex === -1) {
          continue;
        }
        const tag = name.slice(0, commaIndex).trim();
        const cardName = name.slice(commaIndex + 1).trim();
        if (tag.length > 0 && cardName.length > 0) {
          pairs.push({ original: name, tag, name: cardName });
        }
      }

      if (pairs.length === 0) {
        return [];
      }

      const results: (ResolvedCard & { originalName: string })[] = [];

      // Query each pair individually — there are typically very few unresolved names
      for (const pair of pairs) {
        const rows = await appendCanonicalOrder(
          baseQuery()
            .innerJoin("cards as c", "c.id", "p.cardId")
            .select([
              "p.shortCode",
              "c.id as cardId",
              "c.name as cardName",
              "c.type as cardType",
              domainsArray("c.id").as("domains"),
              superTypesArray("c.id").as("superTypes"),
            ])
            .where((eb) => eb.fn("lower", ["c.name"]), "=", pair.name.toLowerCase())
            .where(sql<SqlBool>`c.tags @> ARRAY[${pair.tag}]::text[]`)
            .limit(1),
        ).execute();

        if (rows.length > 0) {
          results.push({
            ...(rows[0] as ResolvedCard),
            originalName: pair.original,
          });
        }
      }

      return results;
    },

    /**
     * Maps card names to card IDs with type info (needed for text format import).
     *
     * Uses case-insensitive matching on the card name column.
     *
     * @returns One entry per unique card name that resolves to a card.
     */
    async cardIdsByNames(names: string[]): Promise<ResolvedCard[]> {
      if (names.length === 0) {
        return [];
      }

      const uniqueNames = [...new Set(names)];
      const lowerNames = uniqueNames.map((name) => name.toLowerCase());

      const rows = await appendCanonicalOrder(
        baseQuery()
          .innerJoin("cards as c", "c.id", "p.cardId")
          .select([
            "p.shortCode",
            "c.id as cardId",
            "c.name as cardName",
            "c.type as cardType",
            domainsArray("c.id").as("domains"),
            superTypesArray("c.id").as("superTypes"),
          ])
          .where((eb) => eb.fn("lower", ["c.name"]), "in", lowerNames)
          .distinctOn((eb) => eb.fn("lower", ["c.name"]))
          .orderBy((eb) => eb.fn("lower", ["c.name"])),
      ).execute();

      return rows as ResolvedCard[];
    },
  };
}
