import type { CardType, Domain, SuperType } from "@openrift/shared/types";
import type { Kysely } from "kysely";

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

/** The five WHERE clauses that define a strict canonical printing. */
const CANONICAL_FILTERS = {
  artVariant: "normal" as const,
  isSigned: false,
  promoTypeId: null,
  finish: "normal" as const,
  language: "EN",
};

/**
 * Bidirectional resolver between card UUIDs and canonical short codes.
 *
 * A "canonical" printing is the earliest-released, normal-variant, non-signed,
 * non-promo, normal-finish, EN-language printing of a card. When no strict
 * canonical printing exists (e.g. foil-only cards), a relaxed fallback is used.
 *
 * @returns An object with resolver methods bound to the given `db`.
 */
export function canonicalPrintingsRepo(db: Kysely<Database>) {
  function canonical() {
    return db
      .selectFrom("printings as p")
      .where("p.artVariant", "=", CANONICAL_FILTERS.artVariant)
      .where("p.isSigned", "=", CANONICAL_FILTERS.isSigned)
      .where("p.promoTypeId", "is", CANONICAL_FILTERS.promoTypeId)
      .where("p.finish", "=", CANONICAL_FILTERS.finish)
      .where("p.language", "=", CANONICAL_FILTERS.language);
  }

  function relaxed() {
    return db
      .selectFrom("printings as p")
      .where("p.isSigned", "=", false)
      .where("p.promoTypeId", "is", null)
      .where("p.language", "=", "EN");
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

      // Strict canonical pass
      const strict = await canonical()
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "p.shortCode"])
        .where("p.cardId", "in", cardIds)
        .distinctOn("p.cardId")
        .orderBy("p.cardId")
        .orderBy("s.releasedAt", "asc")
        .orderBy("p.shortCode", "asc")
        .execute();

      const resolved = new Map(strict.map((row) => [row.cardId, row.shortCode]));

      // Relaxed fallback for foil-only / altart-only cards
      const missing = cardIds.filter((id) => !resolved.has(id));
      if (missing.length > 0) {
        const fallback = await relaxed()
          .innerJoin("sets as s", "s.id", "p.setId")
          .select(["p.cardId", "p.shortCode"])
          .where("p.cardId", "in", missing)
          .distinctOn("p.cardId")
          .orderBy("p.cardId")
          .orderBy("p.artVariant", "asc")
          .orderBy("s.releasedAt", "asc")
          .orderBy("p.shortCode", "asc")
          .execute();

        for (const row of fallback) {
          resolved.set(row.cardId, row.shortCode);
        }
      }

      return [...resolved.entries()].map(([cardId, shortCode]) => ({ cardId, shortCode }));
    },

    /**
     * Maps short codes to card IDs with card type info (needed for zone inference).
     *
     * Tries canonical printings first; falls back to any printing with that
     * short code if no canonical match exists.
     *
     * @returns One entry per unique short code that resolves to a card.
     */
    async cardIdsByShortCodes(shortCodes: string[]): Promise<ResolvedCard[]> {
      if (shortCodes.length === 0) {
        return [];
      }

      // Strict canonical pass
      const strict = await canonical()
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
        .orderBy("p.shortCode")
        .execute();

      const resolved = new Map<string, ResolvedCard>();
      for (const row of strict) {
        resolved.set(row.shortCode, row as ResolvedCard);
      }

      // Relaxed fallback
      const missing = shortCodes.filter((sc) => !resolved.has(sc));
      if (missing.length > 0) {
        const fallback = await relaxed()
          .innerJoin("cards as c", "c.id", "p.cardId")
          .select([
            "p.shortCode",
            "p.cardId",
            "c.name as cardName",
            "c.type as cardType",
            domainsArray("c.id").as("domains"),
            superTypesArray("c.id").as("superTypes"),
          ])
          .where("p.shortCode", "in", missing)
          .distinctOn("p.shortCode")
          .orderBy("p.shortCode")
          .execute();

        for (const row of fallback) {
          resolved.set(row.shortCode, row as ResolvedCard);
        }
      }

      return [...resolved.values()];
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

      // Look up cards by name (case-insensitive), join to a canonical printing
      // to get a short code for the preview response
      const rows = await db
        .selectFrom("cards as c")
        .innerJoin("printings as p", "p.cardId", "c.id")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select([
          "p.shortCode",
          "c.id as cardId",
          "c.name as cardName",
          "c.type as cardType",
          domainsArray("c.id").as("domains"),
          superTypesArray("c.id").as("superTypes"),
        ])
        .where((eb) => eb.fn("lower", ["c.name"]), "in", lowerNames)
        .where("p.artVariant", "=", CANONICAL_FILTERS.artVariant)
        .where("p.isSigned", "=", CANONICAL_FILTERS.isSigned)
        .where("p.promoTypeId", "is", CANONICAL_FILTERS.promoTypeId)
        .where("p.finish", "=", CANONICAL_FILTERS.finish)
        .where("p.language", "=", CANONICAL_FILTERS.language)
        .distinctOn((eb) => eb.fn("lower", ["c.name"]))
        .orderBy((eb) => eb.fn("lower", ["c.name"]))
        .orderBy("s.releasedAt", "asc")
        .orderBy("p.shortCode", "asc")
        .execute();

      return rows as ResolvedCard[];
    },
  };
}
