import type { CatalogResponse, GroupByField, SortOption } from "@openrift/shared";
import {
  filterCards,
  getOrientation,
  legendDisplayName,
  PREFERENCE_DEFAULTS,
  setIndexById,
  sortByLanguageAndCanonicalRank,
  sortCards,
  UNKNOWN_SET_INDEX,
} from "@openrift/shared";
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
  /**
   * True for landscape card types (battlefields). The SSR preview uses the same
   * `getOrientation` rule as the live grid to rotate these into portrait framing
   * instead of squishing the landscape art into the portrait `aspect-card` box.
   */
  rotated: boolean;
}

// Two full rows at the widest grid breakpoint (8 cols at >= 1920px). Narrower
// breakpoints render the same 16 cells but trim overflow with per-breakpoint
// visibility classes in <FirstRowPreview> so each viewport shows complete rows.
const FIRST_ROW_LIMIT = 16;

// SSR can't read the user's `defaultCardView` / `languages` preferences (those
// live in localStorage). Assume the new defaults from PREFERENCE_DEFAULTS so
// the dominant cold-nav case matches the hydrated grid; users who flipped
// their preference see a brief mismatch on first paint. Read straight from
// PREFERENCE_DEFAULTS rather than restating it — a hand-copied default drifts
// the moment the real one changes, and the mismatch would only show up as a
// first-paint flicker nobody traces back to here.
//
// Sort and grouping are the exception: they live in the `view-prefs` cookie
// precisely so this pass can read them (see lib/view-prefs.ts). The handler
// below resolves them per request and passes them in, so a user who groups by
// rarity gets a first row grouped by rarity instead of a reshuffle on hydrate.
const SSR_USER_LANGUAGES: readonly string[] = PREFERENCE_DEFAULTS.languages;
const SSR_DEFAULT_VIEW: "cards" | "printings" = "cards";

/**
 * Slim, SSR-only view of the first N catalog printings in the same order the
 * live <CardBrowser> renders. Mirrors useCards → useCardData → card-grid so
 * the SSR shell shows the same tiles the hydrated grid will:
 *
 *  1. Order printings by (langRank, canonicalRank), default langs `["EN"]`.
 *  2. Apply URL filters (search, sets, languages, etc.) via shared filterCards.
 *  3. In cards view, collapse to one tile per card — split per (cardId, setId)
 *     for set grouping (the default) or per (cardId, rarity) for rarity grouping
 *     (see dedupeToCardsViewTiles). Earliest in the (lang, canonicalRank) order
 *     wins.
 *  4. Sort by `sortBy` (default "id" → shortCode asc).
 *  5. When groupBy="set", reorder main sets before supplemental ones (via
 *     orderSetsMainFirst, matching the live grid's groupItemsBySet), preserving
 *     the within-set order from step 4 (stable sort).
 *  6. Slice to `limit` and project to the slim wire shape.
 *
 * Battlefields are kept (the live grid shows them too) and flagged `rotated` so
 * the preview applies the same -90deg CSS rotation the live grid does, rather
 * than squishing the landscape art into a portrait cell. The image URL is the
 * same in both states, so the preload still primes the eventual LCP element.
 *
 * @returns Up to `limit` slim card entries in live-grid render order.
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
    // Mirror the live grid's set order (groupItemsBySet): main sets lead,
    // supplemental follow, release order preserved within each type. Without
    // this the SSR shell leads with a different set than the hydrated grid.
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
    // Same cookie the hydrated grid resolves its defaults from, so the tiles
    // rendered here are the tiles the live grid will show.
    const viewPrefs = resolveViewPrefsFromCookie(getCookie(VIEW_PREFS_COOKIE));
    return extractFirstRow(catalog, data, FIRST_ROW_LIMIT, viewPrefs.cards);
  });
