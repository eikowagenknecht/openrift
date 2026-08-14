import { getRouteApi } from "@tanstack/react-router";

import type { MetaDeckFilterValues } from "@/lib/meta-deck-filters";
import type { MetaDeckSearch } from "@/lib/meta-deck-search";

const routeApi = getRouteApi("/_app/meta_/decks");

export interface MetaDeckFilterActions {
  /** Toggles one format in or out of the union. */
  toggleFormat: (value: string) => void;
  toggleEvent: (value: string) => void;
  toggleLegend: (value: string) => void;
  /** Replaces the whole selection, for the combobox's multi-select handler. */
  setFormats: (values: string[]) => void;
  setEvents: (values: string[]) => void;
  setLegends: (values: string[]) => void;
  /** Null clears the finish bound. */
  setMaxFinishTier: (value: number | null) => void;
  setDateFrom: (value: string | null) => void;
  setDateTo: (value: string | null) => void;
  clearAllFilters: () => void;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/**
 * The meta deck browser's filters, held in the URL the way the deck list's are,
 * so a filtered view is linkable and the back button walks the filter history.
 * @returns The current filter values and their actions.
 */
export function useMetaDeckFilters(): MetaDeckFilterValues & MetaDeckFilterActions {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // Empty values are dropped rather than written as "" / [], so the default
  // browser keeps a clean URL and the back button doesn't step through states
  // that look identical.
  const update = (patch: Partial<MetaDeckSearch>) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        return Object.fromEntries(
          Object.entries(next).filter(([, value]) => {
            if (value === undefined || value === "") {
              return false;
            }
            return !(Array.isArray(value) && value.length === 0);
          }),
        );
      },
    });
  };

  const formats = search.formats ?? [];
  const events = search.events ?? [];
  const legends = search.legends ?? [];

  return {
    formats,
    events,
    legends,
    maxFinishTier: search.finish ?? null,
    dateFrom: search.from ?? null,
    dateTo: search.to ?? null,

    toggleFormat: (value) => update({ formats: toggle(formats, value) }),
    toggleEvent: (value) => update({ events: toggle(events, value) }),
    toggleLegend: (value) => update({ legends: toggle(legends, value) }),
    setFormats: (values) => update({ formats: values }),
    setEvents: (values) => update({ events: values }),
    setLegends: (values) => update({ legends: values }),
    setMaxFinishTier: (value) => update({ finish: value ?? undefined }),
    setDateFrom: (value) => update({ from: value ?? undefined }),
    setDateTo: (value) => update({ to: value ?? undefined }),
    clearAllFilters: () =>
      update({
        formats: undefined,
        events: undefined,
        legends: undefined,
        finish: undefined,
        from: undefined,
        to: undefined,
      }),
  };
}
