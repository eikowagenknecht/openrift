import type { SortDirection } from "@openrift/shared/types/search";
import { GROUP_BY_FIELDS, SORT_DIRECTIONS, SORT_OPTIONS } from "@openrift/shared/types/search";

import { PROMO_GROUPINGS } from "@/lib/promo-groupings";

// Shared by the Zustand stores in stores/view-prefs-store.ts and the SSR
// cookie resolver below, so both paths clamp identically and the SSR paint
// matches the hydrated grid.

export interface SurfaceViewPrefs {
  sort: string;
  sortDir: SortDirection;
  groupBy: string;
  groupDir: SortDirection;
}

interface ViewSurfaceConfig {
  sorts: ReadonlySet<string>;
  groups: ReadonlySet<string>;
  defaults: SurfaceViewPrefs;
}

const PROMO_GROUPS = PROMO_GROUPINGS;

const DECK_LIST_SORTS = ["updated", "created", "name", "value"] as const;

const DECK_LIST_GROUPS = ["none", "format", "domains", "legend", "validity"] as const;

const CARD_BROWSER_SORTS: ReadonlySet<string> = new Set(SORT_OPTIONS);
const CARD_BROWSER_GROUPS: ReadonlySet<string> = new Set(GROUP_BY_FIELDS);

const CARD_BROWSER_CONFIG: ViewSurfaceConfig = {
  sorts: CARD_BROWSER_SORTS,
  groups: CARD_BROWSER_GROUPS,
  defaults: { sort: "id", sortDir: "asc", groupBy: "set", groupDir: "asc" },
};

export const VIEW_SURFACE_CONFIGS = {
  cards: CARD_BROWSER_CONFIG,
  promos: {
    sorts: CARD_BROWSER_SORTS,
    groups: new Set<string>(PROMO_GROUPS),
    // Must match asPromoGrouping's fallback.
    defaults: { sort: "id", sortDir: "asc", groupBy: "channel", groupDir: "asc" },
  },
  collections: CARD_BROWSER_CONFIG,
  deckBrowser: CARD_BROWSER_CONFIG,
  decks: {
    sorts: new Set<string>(DECK_LIST_SORTS),
    groups: new Set<string>(DECK_LIST_GROUPS),
    defaults: { sort: "updated", sortDir: "desc", groupBy: "none", groupDir: "asc" },
  },
} as const satisfies Record<string, ViewSurfaceConfig>;

export type ViewSurface = keyof typeof VIEW_SURFACE_CONFIGS;

export const COOKIE_VIEW_SURFACES = ["cards", "promos"] as const satisfies readonly ViewSurface[];

export const LOCAL_VIEW_SURFACES = [
  "collections",
  "deckBrowser",
  "decks",
] as const satisfies readonly ViewSurface[];

export type CookieViewSurface = (typeof COOKIE_VIEW_SURFACES)[number];
export type LocalViewSurface = (typeof LOCAL_VIEW_SURFACES)[number];

export type ViewPrefsBlob<Surface extends ViewSurface> = Record<Surface, SurfaceViewPrefs>;

const DIRECTIONS: ReadonlySet<string> = new Set(SORT_DIRECTIONS);

// Falls back per field: an unknown value reaching the grouping code would render an empty grid.
export function sanitizeSurfacePrefs(raw: unknown, surface: ViewSurface): SurfaceViewPrefs {
  const config = VIEW_SURFACE_CONFIGS[surface];
  const { defaults } = config;
  if (!raw || typeof raw !== "object") {
    return { ...defaults };
  }
  const record = raw as Record<string, unknown>;
  return {
    sort: config.sorts.has(record.sort as string) ? (record.sort as string) : defaults.sort,
    sortDir: DIRECTIONS.has(record.sortDir as string)
      ? (record.sortDir as SortDirection)
      : defaults.sortDir,
    groupBy: config.groups.has(record.groupBy as string)
      ? (record.groupBy as string)
      : defaults.groupBy,
    groupDir: DIRECTIONS.has(record.groupDir as string)
      ? (record.groupDir as SortDirection)
      : defaults.groupDir,
  };
}

// Unknown surface keys in the stored blob are dropped, so a renamed surface can't resurrect stale state.
export function sanitizeViewPrefsBlob<Surface extends ViewSurface>(
  raw: unknown,
  surfaces: readonly Surface[],
): ViewPrefsBlob<Surface> {
  const record =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, never>);
  const result = {} as ViewPrefsBlob<Surface>;
  for (const surface of surfaces) {
    result[surface] = sanitizeSurfacePrefs(record[surface], surface);
  }
  return result;
}

export const VIEW_PREFS_COOKIE = "view-prefs";

// Expects the Zustand persist envelope shape:
// {"state":{"cards":{...},"promos":{...}}}
export function resolveViewPrefsFromCookie(
  raw: string | null | undefined,
): ViewPrefsBlob<CookieViewSurface> {
  if (!raw) {
    return sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES);
  }
  try {
    const parsed = JSON.parse(raw) as { state?: unknown } | null;
    return sanitizeViewPrefsBlob(parsed?.state, COOKIE_VIEW_SURFACES);
  } catch {
    return sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES);
  }
}
