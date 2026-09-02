import { getRouteApi } from "@tanstack/react-router";

import type { MetaDeckSearch } from "@/lib/meta-deck-search";
import type { MetaScope, MetaScopeControls } from "@/lib/meta-scope";
import { CLEARED_SCOPE, nextScopeSearch } from "@/lib/meta-scope";

const routeApi = getRouteApi("/_app/meta_/decks");

/** The browser's own axes, on top of the scope bar's. */
export interface MetaDeckFilterState {
  events: string[];
  legends: string[];
  /** Null means any finish. */
  maxRank: number | null;
  /** False is the curated view: one tile per legend per event. */
  showAll: boolean;
  buildable: boolean;
}

export interface MetaDeckFilterActions {
  /** Toggles one value in or out of the union. */
  toggleEvent: (value: string) => void;
  toggleLegend: (value: string) => void;
  /** Replaces the whole selection, for the combobox's multi-select handler. */
  setEvents: (values: string[]) => void;
  setLegends: (values: string[]) => void;
  /** Null clears the finish bound. */
  setMaxRank: (value: number | null) => void;
  setShowAll: (value: boolean) => void;
  setBuildable: (value: boolean) => void;
  clearAllFilters: () => void;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/**
 * The meta deck browser's filters, held in the URL the way the deck list's are,
 * so a filtered view is linkable and the back button walks the filter history.
 *
 * The scope half is handed out as {@link MetaScopeControls} because the scope bar
 * is controlled and `useNavigate` types its reducer against the route it was
 * called from, so the binding has to happen here rather than in a shared hook.
 */
export function useMetaDeckFilters(): MetaDeckFilterState &
  MetaDeckFilterActions &
  MetaScopeControls {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const update = (patch: Partial<MetaDeckSearch>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch) });
  };

  const events = search.events ?? [];
  const legends = search.legends ?? [];

  return {
    scope: search,
    setScope: (patch: Partial<MetaScope>) => update(patch),
    clearScope: () => update(CLEARED_SCOPE),

    events,
    legends,
    maxRank: search.finish ?? null,
    showAll: search.all === true,
    buildable: search.buildable === true,

    toggleEvent: (value) => update({ events: toggle(events, value) }),
    toggleLegend: (value) => update({ legends: toggle(legends, value) }),
    setEvents: (values) => update({ events: values }),
    setLegends: (values) => update({ legends: values }),
    setMaxRank: (value) => update({ finish: value ?? undefined }),
    setShowAll: (value) => update({ all: value ? true : undefined }),
    setBuildable: (value) => update({ buildable: value ? true : undefined }),
    clearAllFilters: () =>
      update({
        ...CLEARED_SCOPE,
        events: undefined,
        legends: undefined,
        finish: undefined,
        buildable: undefined,
      }),
  };
}
