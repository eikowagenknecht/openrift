import type { CardType, Domain, SuperType } from "@openrift/shared/types";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

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
 * A "canonical" printing is the earliest-released, normal-variant, non-signed,
 * non-promo, normal-finish, EN-language printing of a card.
 *
 * @returns An object with resolver methods bound to the given `db`.
 */
export function canonicalPrintingsRepo(db: Kysely<Database>) {
  return {
    /**
     * Maps card UUIDs to their canonical short codes.
     *
     * @returns One entry per card that has a canonical printing. Cards with no
     *   matching printing are omitted from the result.
     */
    async canonicalShortCodesByCardIds(cardIds: string[]): Promise<CanonicalShortCode[]> {
      if (cardIds.length === 0) {
        return [];
      }

      // Try strict canonical filters first
      const canonical = await db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "p.shortCode"])
        .where("p.cardId", "in", cardIds)
        .where("p.artVariant", "=", "normal")
        .where("p.isSigned", "=", false)
        .where("p.promoTypeId", "is", null)
        .where("p.finish", "=", "normal")
        .where("p.language", "=", "EN")
        .distinctOn("p.cardId")
        .orderBy("p.cardId")
        .orderBy("s.releasedAt", "asc")
        .orderBy("p.shortCode", "asc")
        .execute();

      const resolved = new Map(canonical.map((row) => [row.cardId, row.shortCode]));

      // Fall back for cards with no strict-canonical printing (e.g. foil-only cards)
      const missing = cardIds.filter((id) => !resolved.has(id));
      if (missing.length > 0) {
        const fallback = await db
          .selectFrom("printings as p")
          .innerJoin("sets as s", "s.id", "p.setId")
          .select(["p.cardId", "p.shortCode"])
          .where("p.cardId", "in", missing)
          .where("p.isSigned", "=", false)
          .where("p.promoTypeId", "is", null)
          .where("p.language", "=", "EN")
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

      // Try canonical printings first (normal, not signed, no promo, EN)
      const canonical = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select([
          "p.shortCode",
          "p.cardId",
          "c.name as cardName",
          "c.type as cardType",
          "c.superTypes",
          "c.domains",
        ])
        .where("p.shortCode", "in", shortCodes)
        .where("p.artVariant", "=", "normal")
        .where("p.isSigned", "=", false)
        .where("p.promoTypeId", "is", null)
        .where("p.finish", "=", "normal")
        .where("p.language", "=", "EN")
        .distinctOn("p.shortCode")
        .orderBy("p.shortCode")
        .execute();

      const resolved = new Map<string, ResolvedCard>();
      for (const row of canonical) {
        resolved.set(row.shortCode, row);
      }

      // Fall back for any short codes that didn't match a canonical printing
      const missing = shortCodes.filter((sc) => !resolved.has(sc));
      if (missing.length > 0) {
        const fallback = await db
          .selectFrom("printings as p")
          .innerJoin("cards as c", "c.id", "p.cardId")
          .select([
            "p.shortCode",
            "p.cardId",
            "c.name as cardName",
            "c.type as cardType",
            "c.superTypes",
            "c.domains",
          ])
          .where("p.shortCode", "in", missing)
          .distinctOn("p.shortCode")
          .orderBy("p.shortCode")
          .execute();

        for (const row of fallback) {
          resolved.set(row.shortCode, row);
        }
      }

      return [...resolved.values()];
    },
  };
}
