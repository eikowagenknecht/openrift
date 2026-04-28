import type { CatalogResponse } from "@openrift/shared";
import { createServerFn } from "@tanstack/react-start";

import { readCatalogFromServerCache } from "@/lib/catalog-query";

export interface FirstRowCard {
  printingId: string;
  cardName: string;
  setSlug: string;
  thumbnail: string;
  full: string;
}

/**
 * Number of cards the SSR shell preloads via real `<img>` tags. Mirrored on
 * the client side by lifting `CardGrid`'s eager-render floor to this value
 * so every preloaded card paints from cache without the muted-grey + fade
 * flash on hydration.
 */
export const FIRST_ROW_LIMIT = 40;
const PREFERRED_LANGUAGE = "EN";

/**
 * Slim, SSR-only view of the first N catalog printings in the same order the
 * live `<CardBrowser>` renders for a default user (no URL filters,
 * `groupBy="set"`, `sortBy="id"` ascending, language preference EN).
 *
 * - Only EN printings are kept — `PREFERENCE_DEFAULTS.languages` is `["EN"]`,
 *   so a fresh user's grid filters out every non-EN printing. Including them
 *   here would make the SSR preview render cards that disappear on hydration.
 * - Sets are iterated in `catalog.sets` order (the API's `set.sort_order`).
 * - Within each set, printings sort by `shortCode` (locale-aware ascending).
 * - Same-`shortCode` ties resolve by `canonicalRank` — matching the stable
 *   secondary order `useCards` produces for equal-shortCode rows.
 *
 * Battlefields are kept (the live grid shows them too); they render with the
 * portrait aspect of the surrounding cells in this preview, then get
 * CSS-rotated into landscape after hydration. The image URL is the same in
 * both states, so the preload still primes the eventual LCP element.
 * @param catalog The catalog response held in `serverCache`.
 * @param limit Maximum number of cards to return.
 * @returns Up to `limit` slim card entries in live-grid render order.
 */
export function extractFirstRow(catalog: CatalogResponse, limit: number): FirstRowCard[] {
  const setIndex = new Map(catalog.sets.map((set, index) => [set.id, index]));
  const setSlugById = new Map(catalog.sets.map((set) => [set.id, set.slug]));
  const fallbackSetIndex = catalog.sets.length;

  const printings = Object.entries(catalog.printings)
    .filter(([, printing]) => printing.language === PREFERRED_LANGUAGE)
    .map(([id, printing]) => ({
      id,
      printing,
      setIndex: setIndex.get(printing.setId) ?? fallbackSetIndex,
    }));

  printings.sort((a, b) => {
    if (a.setIndex !== b.setIndex) {
      return a.setIndex - b.setIndex;
    }
    const shortCodeCompare = a.printing.shortCode.localeCompare(b.printing.shortCode);
    if (shortCodeCompare !== 0) {
      return shortCodeCompare;
    }
    return a.printing.canonicalRank - b.printing.canonicalRank;
  });

  const result: FirstRowCard[] = [];
  for (const { id, printing } of printings) {
    if (result.length >= limit) {
      break;
    }
    const card = catalog.cards[printing.cardId];
    if (!card) {
      continue;
    }
    const front = printing.images.find((img) => img.face === "front") ?? printing.images[0];
    if (!front) {
      continue;
    }
    const setSlug = setSlugById.get(printing.setId);
    if (!setSlug) {
      continue;
    }
    result.push({
      printingId: id,
      cardName: card.name,
      setSlug,
      thumbnail: front.thumbnail,
      full: front.full,
    });
  }
  return result;
}

export const fetchFirstRowCards = createServerFn({ method: "GET" }).handler(
  async (): Promise<FirstRowCard[]> => {
    const catalog = await readCatalogFromServerCache();
    return extractFirstRow(catalog, FIRST_ROW_LIMIT);
  },
);
