import type { SortDirection } from "@openrift/shared";
import { createContext, useContext } from "react";

import type {
  CookieViewSurface,
  LocalViewSurface,
  SurfaceViewPrefs,
  ViewPrefsBlob,
  ViewSurface,
} from "@/lib/view-prefs";
import {
  COOKIE_VIEW_SURFACES,
  sanitizeViewPrefsBlob,
  VIEW_SURFACE_CONFIGS,
} from "@/lib/view-prefs";
import { useCookieViewPrefsStore, useLocalViewPrefsStore } from "@/stores/view-prefs-store";

// Surfaces that don't opt in (share links, list pages, product pages) leave
// this null and fall back to the URL or the catalog defaults.
const ViewSurfaceContext = createContext<ViewSurface | null>(null);

export const ViewSurfaceProvider = ViewSurfaceContext;

// Provided once in __root so server (no cookie access in the store) and
// client read the same value; defaults keep the hook usable in isolation.
const ResolvedViewPrefsContext = createContext<ViewPrefsBlob<CookieViewSurface>>(
  sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES),
);

export const ResolvedViewPrefsProvider = ResolvedViewPrefsContext;

/** Catalog defaults, used by every surface that hasn't opted in. */
const UNSCOPED_DEFAULTS: SurfaceViewPrefs = VIEW_SURFACE_CONFIGS.cards.defaults;

/**
 * Cookie-backed surfaces read the root-resolved cookie value, not the store:
 * during SSR the store has no cookie access, which would desync server HTML
 * from the hydrated grid.
 */
export function useSurfaceViewDefaults(): SurfaceViewPrefs {
  const surface = useContext(ViewSurfaceContext);
  const resolvedViewPrefs = useContext(ResolvedViewPrefsContext);
  const localPrefs = useLocalViewPrefsStore((state) =>
    surface !== null && surface in state ? state[surface as LocalViewSurface] : undefined,
  );
  if (surface === null) {
    return UNSCOPED_DEFAULTS;
  }
  if (surface in resolvedViewPrefs) {
    return resolvedViewPrefs[surface as CookieViewSurface];
  }
  return localPrefs ?? VIEW_SURFACE_CONFIGS[surface].defaults;
}

function isCookieSurface(surface: ViewSurface): surface is CookieViewSurface {
  return (COOKIE_VIEW_SURFACES as readonly ViewSurface[]).includes(surface);
}

export interface ViewPrefsWriter {
  setSort: (sort: string) => void;
  setSortDir: (sortDir: SortDirection) => void;
  setGroupBy: (groupBy: string) => void;
  setGroupDir: (groupDir: SortDirection) => void;
}

// Unscoped surfaces have nowhere to persist; writes are dropped, only the URL param takes effect.
/* oxlint-disable no-empty-function -- intentional no-ops for unscoped surfaces */
const NO_OP_WRITER: ViewPrefsWriter = {
  setSort: () => {},
  setSortDir: () => {},
  setGroupBy: () => {},
  setGroupDir: () => {},
};
/* oxlint-enable no-empty-function */

/** Arriving via someone else's link only sets the URL; it never overwrites the visitor's own defaults. */
export function useViewPrefsWriter(): ViewPrefsWriter {
  const surface = useContext(ViewSurfaceContext);
  if (surface === null) {
    return NO_OP_WRITER;
  }
  // Aliasing a store hook trips react-compiler's "hooks may not be referenced
  // as normal values" rule, even for `.getState()`, so use the import directly.
  if (isCookieSurface(surface)) {
    const target = surface;
    return {
      setSort: (sort) => useCookieViewPrefsStore.getState().setSort(target, sort),
      setSortDir: (sortDir) => useCookieViewPrefsStore.getState().setSortDir(target, sortDir),
      setGroupBy: (groupBy) => useCookieViewPrefsStore.getState().setGroupBy(target, groupBy),
      setGroupDir: (groupDir) => useCookieViewPrefsStore.getState().setGroupDir(target, groupDir),
    };
  }
  const target = surface as LocalViewSurface;
  return {
    setSort: (sort) => useLocalViewPrefsStore.getState().setSort(target, sort),
    setSortDir: (sortDir) => useLocalViewPrefsStore.getState().setSortDir(target, sortDir),
    setGroupBy: (groupBy) => useLocalViewPrefsStore.getState().setGroupBy(target, groupBy),
    setGroupDir: (groupDir) => useLocalViewPrefsStore.getState().setGroupDir(target, groupDir),
  };
}
