import type { SortDirection } from "@openrift/shared";
import type { StateCreator } from "zustand";
import { create } from "zustand";
import type { PersistOptions, PersistStorage } from "zustand/middleware";
import { persist } from "zustand/middleware";

import { cookieStorage } from "@/lib/cookie-storage";
import type {
  CookieViewSurface,
  LocalViewSurface,
  SurfaceViewPrefs,
  ViewSurface,
} from "@/lib/view-prefs";
import {
  COOKIE_VIEW_SURFACES,
  LOCAL_VIEW_SURFACES,
  sanitizeSurfacePrefs,
  sanitizeViewPrefsBlob,
  VIEW_PREFS_COOKIE,
  VIEW_SURFACE_CONFIGS,
} from "@/lib/view-prefs";

// Per-surface sort/group preferences, split across two stores by whether the
// surface renders server-side (see `lib/view-prefs.ts` for the split and the
// vocabularies). Both stores are built from the same factory so they validate
// and migrate identically; only the storage backend differs.
//
// URL params still win for display on the card-browser surfaces — these stores
// only supply the default when the URL carries no sort/group. Writing the two
// is the toolbar setter's job (see `useFilterActions`), not the store's.

type ViewPrefsState<Surface extends ViewSurface> = Record<Surface, SurfaceViewPrefs> & {
  setSort: (surface: Surface, sort: string) => void;
  setSortDir: (surface: Surface, sortDir: SortDirection) => void;
  setGroupBy: (surface: Surface, groupBy: string) => void;
  setGroupDir: (surface: Surface, groupDir: SortDirection) => void;
  /** Restore one surface to its in-code defaults. */
  resetSurface: (surface: Surface) => void;
};

/**
 * Apply one field to one surface, clamping the result so a caller can never
 * write a value the surface doesn't offer.
 * @returns The partial state update for the surface.
 */
function patchSurface<Surface extends ViewSurface>(
  state: ViewPrefsState<Surface>,
  surface: Surface,
  patch: Partial<SurfaceViewPrefs>,
): Partial<ViewPrefsState<Surface>> {
  const next = sanitizeSurfacePrefs({ ...state[surface], ...patch }, surface);
  return { [surface]: next } as Partial<ViewPrefsState<Surface>>;
}

/**
 * Build a persisted per-surface view-prefs store.
 *
 * `legacyMerge` lets a store adopt values from a store it replaced, so an
 * existing user keeps their choice instead of silently resetting to defaults.
 *
 * @returns A Zustand hook over the surfaces' sort/group state.
 */
function createViewPrefsStore<Surface extends ViewSurface>(
  name: string,
  surfaces: readonly Surface[],
  storage?: PersistStorage<unknown>,
  legacyMerge?: (
    blob: Record<Surface, SurfaceViewPrefs>,
    persisted: Record<string, unknown>,
  ) => Record<Surface, SurfaceViewPrefs>,
) {
  const initializer: StateCreator<ViewPrefsState<Surface>> = (set) => ({
    ...sanitizeViewPrefsBlob(undefined, surfaces),
    setSort: (surface, sort) => set((state) => patchSurface(state, surface, { sort })),
    setSortDir: (surface, sortDir) => set((state) => patchSurface(state, surface, { sortDir })),
    setGroupBy: (surface, groupBy) => set((state) => patchSurface(state, surface, { groupBy })),
    setGroupDir: (surface, groupDir) => set((state) => patchSurface(state, surface, { groupDir })),
    resetSurface: (surface) =>
      set(
        () =>
          ({ [surface]: { ...VIEW_SURFACE_CONFIGS[surface].defaults } }) as Partial<
            ViewPrefsState<Surface>
          >,
      ),
  });

  return create<ViewPrefsState<Surface>>()(
    persist(initializer, {
      name,
      // `cookieStorage` is built by createJSONStorage without a state type, so
      // it lands as PersistStorage<unknown>; the cast re-attaches this store's.
      ...(storage
        ? { storage: storage as PersistOptions<ViewPrefsState<Surface>>["storage"] }
        : {}),
      // Only the surface entries persist; the setters are rebuilt per load.
      partialize: (state) =>
        Object.fromEntries(
          surfaces.map((surface) => [surface, state[surface]]),
        ) as unknown as ViewPrefsState<Surface>,
      // Validate on rehydrate rather than versioning: users run stale cached
      // bundles after a deploy, so a shape change has to be absorbed here.
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object" ? (persisted as Record<string, unknown>) : {};
        const blob = sanitizeViewPrefsBlob(raw, surfaces);
        return { ...current, ...(legacyMerge ? legacyMerge(blob, raw) : blob) };
      },
    }),
  );
}

/**
 * Sort/group prefs for the server-rendered surfaces, persisted to the
 * `view-prefs` cookie so the SSR pass can read them and render the first paint
 * in the user's order. localStorage would be invisible to the server, leaving
 * the server HTML and the hydrated grid disagreeing.
 */
export const useCookieViewPrefsStore = createViewPrefsStore<CookieViewSurface>(
  VIEW_PREFS_COOKIE,
  COOKIE_VIEW_SURFACES,
  cookieStorage,
);

const LEGACY_DECK_LIST_KEY = "openrift-deck-list-prefs";

/**
 * Adopt the deck list's sort/group from the store that used to own them, once,
 * when this store has no `decks` entry yet. Without this, everyone who had set
 * a deck-list sort would silently drop back to "recently updated" on deploy.
 * The legacy store keeps its other keys (density, filters, archived); only the
 * four sort/group fields moved here.
 * @returns The blob with `decks` seeded from the legacy store when applicable.
 */
function adoptLegacyDeckListPrefs(
  blob: Record<LocalViewSurface, SurfaceViewPrefs>,
  persisted: Record<string, unknown>,
): Record<LocalViewSurface, SurfaceViewPrefs> {
  // Only seed when this store has never stored `decks`. Once it has, its own
  // value is authoritative and the legacy blob must not overwrite it.
  if (persisted.decks !== undefined || typeof localStorage === "undefined") {
    return blob;
  }
  try {
    const raw = localStorage.getItem(LEGACY_DECK_LIST_KEY);
    if (!raw) {
      return blob;
    }
    const legacy = JSON.parse(raw)?.state as Record<string, unknown> | undefined;
    if (!legacy) {
      return blob;
    }
    return {
      ...blob,
      // The legacy store called the field `sortField`; everything else lines up.
      decks: sanitizeSurfacePrefs(
        {
          sort: legacy.sortField,
          sortDir: legacy.sortDir,
          groupBy: legacy.groupBy,
          groupDir: legacy.groupDir,
        },
        "decks",
      ),
    };
  } catch {
    return blob;
  }
}

/**
 * Sort/group prefs for the `ssr: "data-only"` surfaces. These render no server
 * HTML, so there is no first paint for a stored default to disagree with and a
 * cookie would only add bytes to every request.
 */
export const useLocalViewPrefsStore = createViewPrefsStore<LocalViewSurface>(
  "view-prefs-local",
  LOCAL_VIEW_SURFACES,
  undefined,
  adoptLegacyDeckListPrefs,
);
