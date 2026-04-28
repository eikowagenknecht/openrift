import type { CatalogResponse, GroupByField, Printing, SortOption } from "@openrift/shared";
import { filterCards, sortByLanguageAndCanonicalRank, sortCards } from "@openrift/shared";
import { createServerFn } from "@tanstack/react-start";

import { searchToFilters } from "@/lib/cards-facets";
import { enrichCatalog, readCatalogFromServerCache } from "@/lib/catalog-query";
import type { FilterSearch } from "@/lib/search-schemas";

export interface FirstRowCard {
  printingId: string;
  cardName: string;
  setSlug: string;
  imageId: string;
}

// Two full rows at the widest grid breakpoint (8 cols at >= 1920px). Narrower
// breakpoints render the same 16 cells but trim overflow with per-breakpoint
// visibility classes in <FirstRowPreview> so each viewport shows complete rows.
const FIRST_ROW_LIMIT = 16;

// SSR can't read the user's `defaultCardView` / `languages` preferences (those
// live in localStorage). Assume the new defaults from PREFERENCE_DEFAULTS so
// the dominant cold-nav case matches the hydrated grid; users who flipped
// their preference see a brief mismatch on first paint.
const SSR_USER_LANGUAGES: readonly string[] = ["EN"];
const SSR_DEFAULT_VIEW: "cards" | "printings" = "cards";
const SSR_DEFAULT_GROUP_BY: GroupByField = "set";
const SSR_DEFAULT_SORT: SortOption = "id";

function dedupByCardSet(printings: Printing[]): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    const key = `${printing.cardId}|${printing.setId}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(printing);
    }
  }
  return result;
}

function dedupByCard(printings: Printing[]): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    if (!seen.has(printing.cardId)) {
      seen.add(printing.cardId);
      result.push(printing);
    }
  }
  return result;
}

/**
 * Slim, SSR-only view of the first N catalog printings in the same order the
 * live <CardBrowser> renders. Mirrors useCards → useCardData → card-grid so
 * the SSR shell shows the same tiles the hydrated grid will:
 *
 *  1. Order printings by (langRank, canonicalRank), default langs `["EN"]`.
 *  2. Apply URL filters (search, sets, languages, etc.) via shared filterCards.
 *  3. In cards view, dedup per (cardId, setId) when groupBy="set" (default), or
 *     per cardId otherwise. Earliest in the (lang, canonicalRank) order wins.
 *  4. Sort by `sortBy` (default "id" → shortCode asc).
 *  5. When groupBy="set", reorder by set.sortOrder, preserving the within-set
 *     order from step 4 (stable sort).
 *  6. Slice to `limit` and project to the slim wire shape.
 *
 * Battlefields are kept (the live grid shows them too); they render with the
 * portrait aspect of the surrounding cells in this preview, then get CSS-
 * rotated into landscape after hydration. The image URL is the same in both
 * states, so the preload still primes the eventual LCP element.
 *
 * @returns Up to `limit` slim card entries in live-grid render order.
 */
export function extractFirstRow(
  catalog: CatalogResponse,
  search: FilterSearch,
  limit: number,
): FirstRowCard[] {
  const view = search.view === "printings" ? "printings" : SSR_DEFAULT_VIEW;
  const groupBy = (search.groupBy ?? SSR_DEFAULT_GROUP_BY) as GroupByField;
  const requestedSort = (search.sort ?? SSR_DEFAULT_SORT) as SortOption;
  // sortCards needs rarityOrder for "rarity" and a price lookup for "price";
  // the SSR pipeline has neither, so fall back to "id" (shortCode) for those.
  const sortBy: SortOption =
    requestedSort === "rarity" || requestedSort === "price" ? "id" : requestedSort;
  const sortDir: "asc" | "desc" = search.sortDir === "desc" ? "desc" : "asc";

  const { allPrintings, sets } = enrichCatalog(catalog);
  const ordered = sortByLanguageAndCanonicalRank(allPrintings, SSR_USER_LANGUAGES);
  const filters = searchToFilters(search);
  const filtered = filterCards(ordered, filters);

  let displayCards = filtered;
  if (view === "cards") {
    displayCards = groupBy === "set" ? dedupByCardSet(filtered) : dedupByCard(filtered);
  }

  let sortedCards = sortCards(displayCards, sortBy, { sortDir });

  if (groupBy === "set") {
    const setSortIndex = new Map(sets.map((set, index) => [set.id, index]));
    const fallbackSetIndex = sets.length;
    sortedCards = sortedCards.toSorted((a, b) => {
      const aIdx = setSortIndex.get(a.setId) ?? fallbackSetIndex;
      const bIdx = setSortIndex.get(b.setId) ?? fallbackSetIndex;
      return aIdx - bIdx;
    });
  }

  const result: FirstRowCard[] = [];
  for (const printing of sortedCards) {
    if (result.length >= limit) {
      break;
    }
    const front = printing.images.find((img) => img.face === "front") ?? printing.images[0];
    if (!front) {
      continue;
    }
    result.push({
      printingId: printing.id,
      cardName: printing.card.name,
      setSlug: printing.setSlug,
      imageId: front.imageId,
    });
  }
  return result;
}

export const fetchFirstRowCards = createServerFn({ method: "GET" })
  .inputValidator((input: FilterSearch) => input)
  .handler(async ({ data }): Promise<FirstRowCard[]> => {
    const catalog = await readCatalogFromServerCache();
    return extractFirstRow(catalog, data, FIRST_ROW_LIMIT);
  });
