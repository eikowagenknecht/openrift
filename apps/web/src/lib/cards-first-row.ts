import { filterCards, sortCards } from "@openrift/shared/filters";
import { setIndexById, UNKNOWN_SET_INDEX } from "@openrift/shared/set-order";
import type { CatalogResponse } from "@openrift/shared/types/api/catalog";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import type { GroupByField, SortOption } from "@openrift/shared/types/search";
import {
  getOrientation,
  legendDisplayName,
  sortByLanguageAndCanonicalRank,
} from "@openrift/shared/utils";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { dedupeToCardsViewTiles } from "@/lib/card-tiles";
import { searchToFilters } from "@/lib/cards-facets";
import { enrichCatalog, readCatalogFromServerCache } from "@/lib/catalog-query";
import { needsCssRotation } from "@/lib/images";
import type { FilterSearch } from "@/lib/search-schemas";
import type { SurfaceViewPrefs } from "@/lib/view-prefs";
import {
  resolveViewPrefsFromCookie,
  VIEW_PREFS_COOKIE,
  VIEW_SURFACE_CONFIGS,
} from "@/lib/view-prefs";

export interface FirstRowCard {
  printingId: string;
  cardName: string;
  setSlug: string;
  imageId: string;
  rotated: boolean;
}

// Two full rows at the widest grid breakpoint (8 cols at >= 1920px). Narrower
// breakpoints trim overflow via per-breakpoint visibility classes instead.
const FIRST_ROW_LIMIT = 16;

// SSR can't read the user's `defaultCardView` / `languages` preferences
// (those live in localStorage); assume PREFERENCE_DEFAULTS instead so the
// dominant cold-nav case matches the hydrated grid.
const SSR_USER_LANGUAGES: readonly string[] = PREFERENCE_DEFAULTS.languages;
const SSR_DEFAULT_VIEW: "cards" | "printings" = "cards";

/**
 * Mirrors useCards → useCardData → card-grid so the SSR shell shows the same
 * tiles, in the same order, the hydrated grid will.
 */
export function extractFirstRow(
  catalog: CatalogResponse,
  search: FilterSearch,
  limit: number,
  viewDefaults: SurfaceViewPrefs = VIEW_SURFACE_CONFIGS.cards.defaults,
): FirstRowCard[] {
  const view = search.view === "printings" ? "printings" : SSR_DEFAULT_VIEW;
  const groupBy = (search.groupBy ?? viewDefaults.groupBy) as GroupByField;
  const requestedSort = (search.sort ?? viewDefaults.sort) as SortOption;
  // sortCards needs rarityOrder for "rarity" and a price lookup for "price";
  // the SSR pipeline has neither, so fall back to "id" (shortCode) for those.
  const sortBy: SortOption =
    requestedSort === "rarity" || requestedSort === "price" ? "id" : requestedSort;
  const sortDir: "asc" | "desc" =
    (search.sortDir ?? viewDefaults.sortDir) === "desc" ? "desc" : "asc";

  const { allPrintings, sets } = enrichCatalog(catalog);
  const ordered = sortByLanguageAndCanonicalRank(allPrintings, SSR_USER_LANGUAGES);
  const filters = searchToFilters(search);
  const filtered = filterCards(ordered, filters);

  let displayCards = filtered;
  if (view === "cards") {
    displayCards = dedupeToCardsViewTiles(filtered, groupBy);
  }

  let sortedCards = sortCards(displayCards, sortBy, { sortDir, sets });

  if (groupBy === "set") {
    // Mirrors the live grid's set order (groupItemsBySet): main sets lead,
    // supplemental follow.
    const setSortIndex = setIndexById(sets);
    sortedCards = sortedCards.toSorted((a, b) => {
      const aIdx = setSortIndex.get(a.setId) ?? UNKNOWN_SET_INDEX;
      const bIdx = setSortIndex.get(b.setId) ?? UNKNOWN_SET_INDEX;
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
      cardName: legendDisplayName(printing.card),
      setSlug: printing.setSlug,
      imageId: front.imageId,
      rotated: needsCssRotation(getOrientation(printing.card.types)),
    });
  }
  return result;
}

export const fetchFirstRowCards = createServerFn({ method: "GET" })
  .validator((input: FilterSearch) => input)
  .handler(async ({ data }): Promise<FirstRowCard[]> => {
    const catalog = await readCatalogFromServerCache();
    // Same cookie the hydrated grid resolves its defaults from.
    const viewPrefs = resolveViewPrefsFromCookie(getCookie(VIEW_PREFS_COOKIE));
    return extractFirstRow(catalog, data, FIRST_ROW_LIMIT, viewPrefs.cards);
  });
