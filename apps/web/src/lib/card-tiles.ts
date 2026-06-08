import type { GroupByField, Printing } from "@openrift/shared";

/**
 * Whether `groupBy` distinguishes a card's individual printings, so in cards
 * view a card splits into more than one tile (set → one per set, rarity → one
 * per rarity). Card-level axes (none, type, domain, …) collapse a card to a
 * single tile. Surfaces gate per-tile behavior on this — click-navigation by
 * printing instead of card, sibling scoping, count aggregation — so it stays
 * defined once.
 *
 * @returns `true` for the splitting axes (set, rarity).
 */
export function splitsCardIntoTiles(groupBy: GroupByField): boolean {
  return groupBy === "set" || groupBy === "rarity";
}

/**
 * Single source of truth for how a card collapses into tiles in "cards" view.
 *
 * Most grouping axes are card-level (type, domain, …) so a card collapses to
 * one tile per `cardId`. Two axes — set and rarity — distinguish a card's
 * individual printings, so a card splits into one tile per distinct value: a
 * card reprinted in N sets gets one tile per set, a card printed at N rarities
 * gets one tile per rarity. Each tile then reads as a complete index of the
 * cards in that section, and owned counts / copies aggregate per tile rather
 * than bleeding across the whole card.
 *
 * Every surface that collapses printings into tiles (catalog, decks, lists,
 * collections, and the SSR first-row preview) keys on this so they can't drift
 * apart. Printings that share a tile key collapse into one tile and their
 * counts sum together.
 *
 * @returns The tile key for `printing` under `groupBy`.
 */
export function cardsViewTileKey(printing: Printing, groupBy: GroupByField): string {
  switch (groupBy) {
    case "set": {
      return `${printing.cardId}|${printing.setId}`;
    }
    case "rarity": {
      return `${printing.cardId}|${printing.rarity}`;
    }
    default: {
      return printing.cardId;
    }
  }
}

/**
 * Dedupe printings to one representative per cards-view tile (see
 * {@link cardsViewTileKey}), preserving first-occurrence order. Callers
 * pre-sort by their preferred tie-break (e.g. languageRank, canonicalRank) so
 * the first printing seen for a tile is the one the user prefers.
 *
 * @returns One printing per tile, in first-occurrence order.
 */
export function dedupeToCardsViewTiles(printings: Printing[], groupBy: GroupByField): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    const key = cardsViewTileKey(printing, groupBy);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(printing);
    }
  }
  return result;
}

/**
 * Narrow a card's full sibling list to the printings that belong to the same
 * tile as `representative` (see {@link cardsViewTileKey}). For set/rarity
 * grouping this keeps only the siblings from the representative's set/rarity so
 * counts, the add-variant popover, and sibling-swap stay scoped to the tile;
 * for card-level axes it returns the siblings unchanged.
 *
 * @returns The tile's siblings, or `undefined` when `siblings` is `undefined`.
 */
export function tileSiblings(
  representative: Printing,
  siblings: Printing[] | undefined,
  groupBy: GroupByField,
): Printing[] | undefined {
  if (!siblings || (groupBy !== "set" && groupBy !== "rarity")) {
    return siblings;
  }
  const tileKey = cardsViewTileKey(representative, groupBy);
  return siblings.filter((sibling) => cardsViewTileKey(sibling, groupBy) === tileKey);
}
