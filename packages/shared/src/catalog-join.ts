import { isReleasedIn, todayUtc } from "./set-release.js";
import type { CatalogResponse } from "./types/api/catalog.js";
import type { Card, Printing } from "./types/catalog.js";

/**
 * The browser and the API both run `filterCards` over this result, so it has
 * to produce identical rows on both sides.
 */
export function joinCatalogPrintings(catalog: CatalogResponse): Printing[] {
  const setsById = new Map(catalog.sets.map((set) => [set.id, set]));
  const cardsById: Record<string, Card> = catalog.cards;
  // One "today" for the whole join, so two printings of the same set cannot
  // land on opposite sides of a midnight that passes mid-join.
  const today = todayUtc();

  const printings: Printing[] = [];
  for (const [id, value] of Object.entries(catalog.printings)) {
    const set = setsById.get(value.setId);
    const card = cardsById[value.cardId];
    if (set && card) {
      printings.push({
        ...value,
        id,
        setSlug: set.slug,
        setReleased: isReleasedIn(set.releases, value.language, today),
        card,
      });
    }
  }
  return printings;
}
