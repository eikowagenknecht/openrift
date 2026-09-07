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

// Split across two stores by whether the surface renders server-side (see
// `lib/view-prefs.ts`). URL params still win for display on the card-browser
// surfaces; these stores only supply the default when the URL carries none.

type ViewPrefsState<Surface extends ViewSurface> = Record<Surface, SurfaceViewPrefs> & {
  setSort: (surface: Surface, sort: string) => void;
  setSortDir: (surface: Surface, sortDir: SortDirection) => void;
  setGroupBy: (surface: Surface, groupBy: string) => void;
  setGroupDir: (surface: Surface, groupDir: SortDirection) => void;
  resetSurface: (surface: Surface) => void;
};

/** Clamps the result so a caller can never write a value the surface doesn't offer. */
function patchSurface<Surface extends ViewSurface>(
  state: ViewPrefsState<Surface>,
  surface: Surface,
  patch: Partial<SurfaceViewPrefs>,
): Partial<ViewPrefsState<Surface>> {
  const next = sanitizeSurfacePrefs({ ...state[surface], ...patch }, surface);
  return { [surface]: next } as Partial<ViewPrefsState<Surface>>;
}

/** `legacyMerge` lets a store adopt values from a store it replaced. */
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
      partialize: (state) =>
        Object.fromEntries(
          surfaces.map((surface) => [surface, state[surface]]),
        ) as unknown as ViewPrefsState<Surface>,
      // Never add a persist `version` here: sanitizeViewPrefsBlob in merge already normalizes stale cached shapes.
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
 * Persisted to the `view-prefs` cookie, not localStorage, so the SSR pass can
 * read it and render the first paint in the user's order.
 */
export const useCookieViewPrefsStore = createViewPrefsStore<CookieViewSurface>(
  VIEW_PREFS_COOKIE,
  COOKIE_VIEW_SURFACES,
  cookieStorage,
);

const LEGACY_DECK_LIST_KEY = "openrift-deck-list-prefs";

function adoptLegacyDeckListPrefs(
  blob: Record<LocalViewSurface, SurfaceViewPrefs>,
  persisted: Record<string, unknown>,
): Record<LocalViewSurface, SurfaceViewPrefs> {
  // Must not overwrite `decks` once this store has stored its own value.
  if (persisted.decks !== undefined || typeof localStorage === "undefined") {
    return blob;
  }
  try {
    const raw = localStorage.getItem(LEGACY_DECK_LIST_KEY);
    if (!raw) {
      return blob;
    }
    const legacy = (JSON.parse(raw) as { state?: Record<string, unknown> } | null)?.state;
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
 * For `ssr: "data-only"` surfaces: no server HTML means no first paint to
 * disagree with, so localStorage is fine here.
 */
export const useLocalViewPrefsStore = createViewPrefsStore<LocalViewSurface>(
  "view-prefs-local",
  LOCAL_VIEW_SURFACES,
  undefined,
  adoptLegacyDeckListPrefs,
);
