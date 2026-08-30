import { useNavigate } from "@tanstack/react-router";

import type { ServerSort } from "@/components/admin/admin-table";
import type { MetaSearch } from "@/routes/_app/_authenticated/admin/meta";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

/** Which way a server-paged list is ordered. */
export type SortDirection = "asc" | "desc";

/** The URL plumbing every server-paged table on the Meta Archive route shares. */
export interface UrlTableFilters {
  /** The page being shown, counting from one. */
  page: number;
  /**
   * Writes one filter change to the URL. Every filter reframes the whole result
   * set, so each change starts over at the first page. The navigate replaces
   * rather than pushes: the debounced fields would otherwise leave a history
   * entry per pause in typing.
   */
  applyFilter: (next: Partial<MetaSearch>) => void;
  goToPage: (next: number) => void;
}

/**
 * Reads the page out of the Meta Archive route's search params and hands back
 * the two writers its tabs navigate with. The tabs share one search schema, so
 * they share this rather than each spelling out the same two `navigate` calls.
 *
 * @param filters The route's current search params.
 * @returns The current page plus the filter and page writers.
 */
export function useUrlTableFilters(filters: MetaSearch): UrlTableFilters {
  const navigate = useNavigate({ from: Route.fullPath });

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

/** The order a table falls back to, and the vocabulary its endpoint accepts. */
export interface UrlSortConfig<TSort extends string> {
  key: TSort | undefined;
  direction: SortDirection | undefined;
  /**
   * The order the list falls back to. The endpoint always has to name one, so
   * taking the sort off a column means coming back here rather than to nothing.
   */
  fallback: { sort: TSort; direction: SortDirection };
  /** Every sort key the endpoint accepts. */
  keys: readonly TSort[];
  /** Undefined on both fields means "back to the fallback", which the URL carries by leaving the params off. */
  onChange: (next: { sort?: TSort; direction?: SortDirection }) => void;
}

/**
 * Resolves a table's order from the URL and builds the {@link ServerSort} its
 * headers report through. A header's third click sends a null key, which lands
 * back on the fallback order rather than on no order at all.
 *
 * @returns The active order plus the sort handler {@link ServerSort} needs.
 */
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
      // The sort reframes the result set the same way a filter does, so it
      // starts over at the first page too.
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
