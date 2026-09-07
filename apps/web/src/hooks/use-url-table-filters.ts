import { getRouteApi } from "@tanstack/react-router";

import type { MetaSearch } from "@/lib/admin-meta-search";
import type { ServerSort } from "@/lib/admin-table-types";

const routeApi = getRouteApi("/_app/_authenticated/admin/meta");

export type SortDirection = "asc" | "desc";

export interface UrlTableFilters {
  page: number;
  /** Resets to page 1; replaces (not pushes) so debounced typing doesn't spam history. */
  applyFilter: (next: Partial<MetaSearch>) => void;
  goToPage: (next: number) => void;
}

export function useUrlTableFilters(filters: MetaSearch): UrlTableFilters {
  const navigate = routeApi.useNavigate();

  function applyFilter(next: Partial<MetaSearch>) {
    void navigate({
      search: (prev) => ({ ...prev, ...next, page: undefined }),
      replace: true,
    });
  }

  function goToPage(next: number) {
    void navigate({
      search: (prev) => ({ ...prev, page: next === 1 ? undefined : next }),
      replace: true,
    });
  }

  return { page: filters.page ?? 1, applyFilter, goToPage };
}

export interface UrlSortConfig<TSort extends string> {
  key: TSort | undefined;
  direction: SortDirection | undefined;
  fallback: { sort: TSort; direction: SortDirection };
  keys: readonly TSort[];
  /** Undefined on both fields reverts to `fallback`. */
  onChange: (next: { sort?: TSort; direction?: SortDirection }) => void;
}

/** A header's third click sends a null key, which lands back on the fallback order. */
export function urlTableSort<TSort extends string>({
  key,
  direction,
  fallback,
  keys,
  onChange,
}: UrlSortConfig<TSort>): { sort: TSort; direction: SortDirection; serverSort: ServerSort } {
  const sort = key ?? fallback.sort;
  const activeDirection = direction ?? fallback.direction;
  return {
    sort,
    direction: activeDirection,
    serverSort: {
      key: sort,
      direction: activeDirection,
      onChange: (next) => {
        const picked = keys.find((value) => value === next.key);
        if (picked === undefined) {
          onChange({ sort: undefined, direction: undefined });
          return;
        }
        onChange({ sort: picked, direction: next.direction });
      },
    },
  };
}
