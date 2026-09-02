import type { SortDirection } from "@openrift/shared";
import { GROUP_BY_FIELDS, SORT_DIRECTIONS, SORT_OPTIONS } from "@openrift/shared";

import { PROMO_GROUPINGS } from "@/lib/promo-groupings";

// Per-surface sort/group defaults ("view prefs"). Two things share this module:
// the Zustand stores in `stores/view-prefs-store.ts` (which own the persisted
// blobs) and the SSR resolver below (which reads the cookie server-side before
// any store exists). Keeping the vocabularies and validation here means both
// paths clamp identically, so the SSR paint and the hydrated grid agree.
//
// Sort/group values are surface-specific: /cards sorts by "id" | "name" | ...
// while the deck list sorts by "updated" | "created" | ... Each surface
// therefore declares its own allowed sets rather than sharing one enum.

/** Sort/group state a single surface remembers. */
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

/**
 * Group axes /promos offers — the shared list minus "none" and "collection",
 * led by its own channel tree. Owned by promo-groupings so the page's dropdown
 * and this validation can't disagree about what a stored value may be.
 */
const PROMO_GROUPS = PROMO_GROUPINGS;

/** Sort fields the deck list offers (deck metadata, not card attributes). */
const DECK_LIST_SORTS = ["updated", "created", "name", "value"] as const;

/** Group axes the deck list offers. */
const DECK_LIST_GROUPS = ["none", "format", "domains", "legend", "validity"] as const;

const CARD_BROWSER_SORTS: ReadonlySet<string> = new Set(SORT_OPTIONS);
const CARD_BROWSER_GROUPS: ReadonlySet<string> = new Set(GROUP_BY_FIELDS);

const CARD_BROWSER_CONFIG: ViewSurfaceConfig = {
  sorts: CARD_BROWSER_SORTS,
  groups: CARD_BROWSER_GROUPS,
  defaults: { sort: "id", sortDir: "asc", groupBy: "set", groupDir: "asc" },
};

/**
 * Every surface that remembers its own sort/group choice.
 *
 * `cards` and `promos` render server-side, so their prefs live in a cookie the
 * SSR pass can read (see `resolveViewPrefsFromCookie`). The rest are
 * `ssr: "data-only"` routes with no server HTML, so a localStorage blob is
 * enough and costs nothing per request.
 */
export const VIEW_SURFACE_CONFIGS = {
  cards: CARD_BROWSER_CONFIG,
  promos: {
    sorts: CARD_BROWSER_SORTS,
    groups: new Set<string>(PROMO_GROUPS),
    // /promos is a hierarchy first: channel is the axis the page is built
    // around, matching `asPromoGrouping`'s fallback.
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

/** Surfaces whose prefs ride in the `view-prefs` cookie so SSR can read them. */
export const COOKIE_VIEW_SURFACES = ["cards", "promos"] as const satisfies readonly ViewSurface[];

/** Surfaces whose prefs live in localStorage (no server-rendered grid). */
export const LOCAL_VIEW_SURFACES = [
  "collections",
  "deckBrowser",
  "decks",
] as const satisfies readonly ViewSurface[];

export type CookieViewSurface = (typeof COOKIE_VIEW_SURFACES)[number];
export type LocalViewSurface = (typeof LOCAL_VIEW_SURFACES)[number];

/** The persisted shape: one entry per surface the owning store covers. */
export type ViewPrefsBlob<Surface extends ViewSurface> = Record<Surface, SurfaceViewPrefs>;

const DIRECTIONS: ReadonlySet<string> = new Set(SORT_DIRECTIONS);

/**
 * Clamp one surface's persisted entry to values the surface actually offers.
 * A stale bookmark, a hand-edited cookie, or a renamed axis falls back per
 * field rather than reaching the grouping code, where an unknown value would
 * render an empty grid.
 * @returns The sanitized prefs for the surface.
 */
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

/**
 * Build a full blob for `surfaces`, sanitizing whatever the persisted value
 * holds. Unknown surface keys in the stored blob are dropped rather than
 * passed through, so a renamed surface can't resurrect stale state.
 * @returns One sanitized entry per requested surface.
 */
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

/** Cookie name the cookie-backed store persists under. Read during SSR. */
export const VIEW_PREFS_COOKIE = "view-prefs";

/**
 * Resolve the raw `view-prefs` cookie (Zustand persist envelope,
 * `{"state":{"cards":{...},"promos":{...}}}`) to the defaults the SSR pass
 * should render with. Mirrors `resolveThemeFromCookie` in `shell-prefs.ts`:
 * the server reads the request cookie, the client reads `document.cookie`, and
 * both land on the same value so the hydrated grid matches the server HTML.
 *
 * @param raw - The decoded cookie value, or null/undefined when absent.
 * @returns Sanitized prefs for every cookie-backed surface.
 */
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
