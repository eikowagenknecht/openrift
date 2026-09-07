import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export function deckCheckCatalogRepo(db: Kysely<Database>) {
  return {
    /**
     * The canonical printing of each given card, purely to source a thumbnail
     * for a resolved decklist line. Name resolution itself is not here: it runs
     * against the shared in-memory lookup index
     * (`services/card-lookup-index.ts`), so a decklist name reaches the same
     * card the pickers, the chat lookup and the Discord bot reach.
     */
    async canonicalPrintingByCard(cardIds: string[]): Promise<Map<string, string>> {
      const thumbnailByCard = new Map<string, string>();
      if (cardIds.length === 0) {
        return thumbnailByCard;
      }
      const printingRows = await db
        .selectFrom("printingsOrdered")
        .select(["id", "cardId"])
        .where("cardId", "in", cardIds)
        .orderBy("canonicalRank", "asc")
        .execute();
      for (const row of printingRows) {
        if (!thumbnailByCard.has(row.cardId)) {
          thumbnailByCard.set(row.cardId, row.id);
        }
      }
      return thumbnailByCard;
    },

    async getCardsByShortCodes(
      shortCodes: string[],
    ): Promise<Map<string, { cardId: string; name: string; types: string[] }>> {
      if (shortCodes.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select(["p.shortCode", "c.id", "c.name", "mca.types"])
        .where("p.shortCode", "in", [...new Set(shortCodes)])
        .execute();
      const byShortCode = new Map<string, { cardId: string; name: string; types: string[] }>();
      for (const row of rows) {
        if (!byShortCode.has(row.shortCode)) {
          byShortCode.set(row.shortCode, { cardId: row.id, name: row.name, types: row.types });
        }
      }
      return byShortCode;
    },

    async getCardDetails(cardIds: string[]): Promise<
      Map<
        string,
        {
          id: string;
          name: string;
          type: string;
          types: string[];
          superTypes: string[];
          domains: string[];
          tags: string[];
          keywords: string[];
          maxCopiesOverride: number | null;
        }
      >
    > {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards as c")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select([
          "c.id",
          "c.name",
          "c.type",
          "mca.types",
          "mca.superTypes",
          "mca.domains",
          "c.tags",
          "c.keywords",
          "c.maxCopiesOverride",
        ])
        .where("c.id", "in", cardIds)
        .execute();
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            type: row.type,
            types: row.types,
            superTypes: row.superTypes ?? [],
            domains: row.domains ?? [],
            tags: row.tags ?? [],
            keywords: row.keywords ?? [],
            maxCopiesOverride: row.maxCopiesOverride,
          },
        ]),
      );
    },

    async getCardSetSlugs(cardIds: string[]): Promise<Map<string, string[]>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "s.slug"])
        .where("p.cardId", "in", cardIds)
        .groupBy(["p.cardId", "s.slug"])
        .execute();
      const bySets = new Map<string, string[]>();
      for (const row of rows) {
        const list = bySets.get(row.cardId) ?? [];
        list.push(row.slug);
        bySets.set(row.cardId, list);
      }
      return bySets;
    },
  };
}
