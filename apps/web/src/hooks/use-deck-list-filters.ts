import type { Domain } from "@openrift/shared";
import { getRouteApi } from "@tanstack/react-router";

import type { DeckListSearch } from "@/lib/deck-list-search";
import { cycleIncludeExclude } from "@/lib/filter-cycle";

const routeApi = getRouteApi("/_app/decks/");

/** Absent = both, "valid" / "invalid" = require that state. */
export type DeckListValidity = "all" | "valid" | "invalid";

export interface DeckListFilterValues {
  search: string;
  /** Deck-format slugs to require; empty means every format. */
  formats: string[];
  /** Deck-format slugs to reject (ADR-034). */
  formatsExclude: string[];
  validity: DeckListValidity;
  domains: Domain[];
  domainsExclude: Domain[];
  showArchived: boolean;
  /** True when anything narrows the list. The archived toggle widens it, so it doesn't count. */
  hasActiveFilters: boolean;
}

export interface DeckListFilterActions {
  setSearch: (value: string) => void;
  /** Cycles one format off → include → exclude → off. */
  cycleFormat: (value: string) => void;
  /** Cycles one domain off → include → exclude → off. */
  cycleDomain: (value: string) => void;
  /** Cycles all → valid → invalid → all, matching the card browser's flag badges. */
  cycleValidity: () => void;
  setValidity: (value: DeckListValidity) => void;
  setShowArchived: (value: boolean) => void;
  clearAllFilters: () => void;
}

/** The flag-badge cycle: off → include → exclude → off. */
const VALIDITY_CYCLE: Record<DeckListValidity, DeckListValidity> = {
  all: "valid",
  valid: "invalid",
  invalid: "all",
};

/**
 * The deck list's filters, held in the URL like the card browser's are, so a
 * filtered list is linkable and the back button walks the filter history.
 *
 * The URL carries only what narrows the list. Density, sort and grouping stay
 * in the preference stores — they are how the user reads every deck list, not
 * a property of the one they are looking at.
 * @returns The current filter values and their actions.
 */
export function useDeckListFilters(): DeckListFilterValues & DeckListFilterActions {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // Empty values are dropped rather than written as "" / [] / false, so a
  // default list keeps a clean URL and the back button doesn't step through
  // states that look identical. Each change pushes a history entry, as on the
  // card browser; the search box debounces through `useSearchUrlSync` so
  // typing doesn't leave one entry per keystroke.
  const update = (patch: Partial<DeckListSearch>) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        return Object.fromEntries(
          Object.entries(next).filter(([, value]) => {
            if (value === undefined || value === "" || value === false) {
              return false;
            }
            return !(Array.isArray(value) && value.length === 0);
          }),
        );
      },
    });
  };

  const domains = (search.domains ?? []) as Domain[];
  const domainsExclude = (search.domainsEx ?? []) as Domain[];
  const formats = search.formats ?? [];
  const formatsExclude = search.formatsEx ?? [];
  const validity = search.validity ?? "all";

  return {
    search: search.search ?? "",
    formats,
    formatsExclude,
    validity,
    domains,
    domainsExclude,
    showArchived: search.archived ?? false,
    hasActiveFilters:
      (search.search ?? "") !== "" ||
      formats.length > 0 ||
      formatsExclude.length > 0 ||
      validity !== "all" ||
      domains.length > 0 ||
      domainsExclude.length > 0,

    setSearch: (value) => update({ search: value }),
    cycleFormat: (value) => {
      const next = cycleIncludeExclude(formats, formatsExclude, value);
      update({ formats: next.included, formatsEx: next.excluded });
    },
    cycleDomain: (value) => {
      const next = cycleIncludeExclude(domains, domainsExclude, value);
      update({ domains: next.included, domainsEx: next.excluded });
    },
    setValidity: (value) => update({ validity: value === "all" ? undefined : value }),
    cycleValidity: () => {
      const next = VALIDITY_CYCLE[validity];
      update({ validity: next === "all" ? undefined : next });
    },
    setShowArchived: (value) => update({ archived: value }),
    clearAllFilters: () =>
      update({
        search: undefined,
        formats: undefined,
        formatsEx: undefined,
        validity: undefined,
        domains: undefined,
        domainsEx: undefined,
      }),
  };
}
