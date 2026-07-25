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

// Tells the shared filter hooks which surface they are rendering inside, so
// sort/group fall back to that surface's remembered choice instead of one
// hardcoded default. Surfaces that don't opt in (share links, list pages,
// product pages) leave this null and keep the previous behaviour: the URL, or
// the catalog defaults.

const ViewSurfaceContext = createContext<ViewSurface | null>(null);

export const ViewSurfaceProvider = ViewSurfaceContext;

// The cookie-backed prefs the root route resolved for this request. Provided
// once in __root so the whole tree reads the same value on the server (where
// the Zustand store has no cookie access) and on the client. Defaults keep the
// hook usable in isolation, e.g. in tests that render a surface directly.
const ResolvedViewPrefsContext = createContext<ViewPrefsBlob<CookieViewSurface>>(
  sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES),
);

export const ResolvedViewPrefsProvider = ResolvedViewPrefsContext;

/** Catalog defaults, used by every surface that hasn't opted in. */
const UNSCOPED_DEFAULTS: SurfaceViewPrefs = VIEW_SURFACE_CONFIGS.cards.defaults;

/**
 * The sort/group defaults for the surface currently being rendered.
 *
 * Cookie-backed surfaces (/cards, /promos) read the value the root route
 * resolved from the request cookie rather than the store: during SSR the store
 * has no cookie access, and reading the store there would make the server HTML
 * disagree with the hydrated grid. That value is refreshed by the root's
 * `beforeLoad` on every navigation, and every toolbar change writes a URL param
 * (which wins for display anyway), so it can never be stale on screen.
 *
 * @returns The defaults to apply when the URL carries no sort/group.
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

/**
 * Whether a surface's prefs live in the cookie store rather than the local one.
 * @returns True when the cookie store owns the surface.
 */
function isCookieSurface(surface: ViewSurface): surface is CookieViewSurface {
  return (COOKIE_VIEW_SURFACES as readonly ViewSurface[]).includes(surface);
}

/** Writes one surface's remembered sort/group to whichever store owns it. */
export interface ViewPrefsWriter {
  setSort: (sort: string) => void;
  setSortDir: (sortDir: SortDirection) => void;
  setGroupBy: (groupBy: string) => void;
  setGroupDir: (groupDir: SortDirection) => void;
}

// Surfaces that never opted in have nowhere to persist to, so their writes are
// deliberately dropped and only the URL param takes effect.
/* oxlint-disable no-empty-function -- intentional no-ops for unscoped surfaces */
const NO_OP_WRITER: ViewPrefsWriter = {
  setSort: () => {},
  setSortDir: () => {},
  setGroupBy: () => {},
  setGroupDir: () => {},
};
/* oxlint-enable no-empty-function */

/**
 * Persist the current surface's sort/group choice. Paired with the URL write in
 * `useFilterActions`: the store remembers the choice for next time, the URL
 * makes the current view shareable. Arriving via someone else's link only sets
 * the URL, so it never overwrites the visitor's own defaults.
 *
 * @returns Setters for the active surface, or no-ops when unscoped.
 */
export function useViewPrefsWriter(): ViewPrefsWriter {
  const surface = useContext(ViewSurfaceContext);
  if (surface === null) {
    return NO_OP_WRITER;
  }
  // The stores are referenced through their imported bindings rather than a
  // local alias: aliasing a hook trips react-compiler's "hooks may not be
  // referenced as normal values" rule, even when only `.getState()` is used.
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
