import type { Domain } from "@openrift/shared/types/enums";
import { getRouteApi } from "@tanstack/react-router";

import type { DeckListSearch } from "@/lib/deck-list-search";
import type { DeckListDrafts, DeckListValidity } from "@/lib/deck-list-utils";
import { cycleIncludeExclude } from "@/lib/filter-cycle";

const routeApi = getRouteApi("/_app/decks/");

export interface DeckListFilterValues {
  search: string;
  formats: string[];
  formatsExclude: string[];
  validity: DeckListValidity;
  drafts: DeckListDrafts;
  domains: Domain[];
  domainsExclude: Domain[];
  folders: string[];
  foldersExclude: string[];
  showArchived: boolean;
  hasActiveFilters: boolean;
}

export interface DeckListFilterActions {
  setSearch: (value: string) => void;
  cycleFormat: (value: string) => void;
  cycleDomain: (value: string) => void;
  cycleFolder: (value: string) => void;
  cycleValidity: () => void;
  setValidity: (value: DeckListValidity) => void;
  cycleDrafts: () => void;
  setDrafts: (value: DeckListDrafts) => void;
  setShowArchived: (value: boolean) => void;
  clearAllFilters: () => void;
}

const VALIDITY_CYCLE: Record<DeckListValidity, DeckListValidity> = {
  all: "valid",
  valid: "invalid",
  invalid: "all",
};

const DRAFTS_CYCLE: Record<DeckListDrafts, DeckListDrafts> = {
  all: "only",
  only: "hide",
  hide: "all",
};

export function useDeckListFilters(): DeckListFilterValues & DeckListFilterActions {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

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
  const folders = search.folders ?? [];
  const foldersExclude = search.foldersEx ?? [];
  const validity = search.validity ?? "all";
  const drafts = search.drafts ?? "all";

  return {
    search: search.search ?? "",
    formats,
    formatsExclude,
    validity,
    drafts,
    domains,
    domainsExclude,
    folders,
    foldersExclude,
    showArchived: search.archived ?? false,
    hasActiveFilters:
      (search.search ?? "") !== "" ||
      formats.length > 0 ||
      formatsExclude.length > 0 ||
      validity !== "all" ||
      drafts !== "all" ||
      domains.length > 0 ||
      domainsExclude.length > 0 ||
      folders.length > 0 ||
      foldersExclude.length > 0,

    setSearch: (value) => update({ search: value }),
    cycleFormat: (value) => {
      const next = cycleIncludeExclude(formats, formatsExclude, value);
      update({ formats: next.included, formatsEx: next.excluded });
    },
    cycleDomain: (value) => {
      const next = cycleIncludeExclude(domains, domainsExclude, value);
      update({ domains: next.included, domainsEx: next.excluded });
    },
    cycleFolder: (value) => {
      const next = cycleIncludeExclude(folders, foldersExclude, value);
      update({ folders: next.included, foldersEx: next.excluded });
    },
    setValidity: (value) => update({ validity: value === "all" ? undefined : value }),
    cycleValidity: () => {
      const next = VALIDITY_CYCLE[validity];
      update({ validity: next === "all" ? undefined : next });
    },
    setDrafts: (value) => update({ drafts: value === "all" ? undefined : value }),
    cycleDrafts: () => {
      const next = DRAFTS_CYCLE[drafts];
      update({ drafts: next === "all" ? undefined : next });
    },
    setShowArchived: (value) => update({ archived: value }),
    clearAllFilters: () =>
      update({
        search: undefined,
        formats: undefined,
        formatsEx: undefined,
        validity: undefined,
        drafts: undefined,
        domains: undefined,
        domainsEx: undefined,
        folders: undefined,
        foldersEx: undefined,
      }),
  };
}
