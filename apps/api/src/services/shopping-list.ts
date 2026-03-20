import type { ShoppingListItemResponse } from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { copiesRepo } from "../repositories/copies.js";
import { decksRepo } from "../repositories/decks.js";
import { wishListsRepo } from "../repositories/wish-lists.js";

/**
 * Builds a unified "still needed" shopping list by aggregating
 * wanted deck shortfalls and wish list items against owned copies.
 * @returns Sorted list of items with demand, ownership, and source info
 */
export async function buildShoppingList(
  db: Kysely<Database>,
  userId: string,
): Promise<ShoppingListItemResponse[]> {
  // Run all three independent queries in parallel
  const [ownedRows, deckCardRows, wishItemRows] = await Promise.all([
    copiesRepo(db).countByCardAndPrintingForDeckbuilding(userId),
    decksRepo(db).wantedCardRequirements(userId),
    wishListsRepo(db).allItemsForUser(userId),
  ]);

  const ownedByCard = new Map<string, number>();
  const ownedByPrinting = new Map<string, number>();
  for (const row of ownedRows) {
    ownedByCard.set(row.cardId, (ownedByCard.get(row.cardId) ?? 0) + row.count);
    ownedByPrinting.set(row.printingId, row.count);
  }

  const deckDemands = deckCardRows.map((dc) => ({
    source: "deck" as const,
    demandSourceId: dc.deckId,
    sourceName: dc.deckName,
    cardId: dc.cardId,
    needed: dc.quantity,
  }));

  const wishDemands = wishItemRows.map((item) => ({
    source: "wish_list" as const,
    demandSourceId: item.wishListId,
    sourceName: item.wishListName,
    cardId: item.cardId,
    printingId: item.printingId,
    needed: item.quantityDesired,
  }));

  // 4. Aggregate total demand per card
  const demandByCard = new Map<string, number>();

  for (const d of deckDemands) {
    demandByCard.set(d.cardId, (demandByCard.get(d.cardId) ?? 0) + d.needed);
  }

  for (const d of wishDemands) {
    if (d.cardId) {
      demandByCard.set(d.cardId, (demandByCard.get(d.cardId) ?? 0) + d.needed);
    }
  }

  // Per-printing wish demands are separate (not aggregated by card)
  const demandByPrinting = new Map<string, number>();
  for (const d of wishDemands) {
    if (d.printingId) {
      demandByPrinting.set(d.printingId, (demandByPrinting.get(d.printingId) ?? 0) + d.needed);
    }
  }

  // 5. Build result
  const items: ShoppingListItemResponse[] = [];

  // Card-level demands
  for (const [cardId, totalDemand] of demandByCard) {
    const owned = ownedByCard.get(cardId) ?? 0;
    const stillNeeded = Math.max(0, totalDemand - owned);

    const sources = [
      ...deckDemands.filter((d) => d.cardId === cardId),
      ...wishDemands.filter((d) => d.cardId === cardId),
    ].map((d) => ({
      source: d.source,
      demandSourceId: d.demandSourceId,
      sourceName: d.sourceName,
      needed: d.needed,
    }));

    items.push({ cardId, printingId: null, totalDemand, owned, stillNeeded, sources });
  }

  // Printing-level demands
  for (const [printingId, totalDemand] of demandByPrinting) {
    const owned = ownedByPrinting.get(printingId) ?? 0;
    const stillNeeded = Math.max(0, totalDemand - owned);

    const sources = wishDemands
      .filter((d) => d.printingId === printingId)
      .map((d) => ({
        source: d.source,
        demandSourceId: d.demandSourceId,
        sourceName: d.sourceName,
        needed: d.needed,
      }));

    items.push({ cardId: null, printingId, totalDemand, owned, stillNeeded, sources });
  }

  // Sort by stillNeeded desc, then by card/printing
  items.sort((a, b) => b.stillNeeded - a.stillNeeded);

  return items;
}
