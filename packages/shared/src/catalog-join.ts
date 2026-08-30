import { isReleasedIn, todayUtc } from "./set-release.js";
import type { CatalogResponse } from "./types/api/catalog.js";
import type { Card, Printing } from "./types/catalog.js";

/**
 * Joins a {@link CatalogResponse} into the flat `Printing[]` that `filterCards`
 * evaluates against. Both the browser (the card browser's enriched catalog) and
 * the API (server-side list-rule expansion) run the same rules over the result,
 * so the join has to produce identical rows on both sides.
 *
 * A printing whose set or card is missing from the payload is dropped: the
 * language-split catalog variants ship printings without their core, and a row
 * with no card cannot be filtered on anyway.
 *
 * @returns The joined printings, in payload order.
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
        // A set reaches each language on its own date, and a printing knows
        // which language it is.
        setReleased: isReleasedIn(set.releases, value.language, today),
        card,
      });
    }
  }
  return printings;
}
