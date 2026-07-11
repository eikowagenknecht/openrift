import type { SortingState } from "@tanstack/react-table";

export function parseSortParam(sort: string | undefined): SortingState {
  if (!sort) {
    return [];
  }
  const [id, dir] = sort.split(":");
  if (!id) {
    return [];
  }
  return [{ id, desc: dir === "desc" }];
}

export function stringifySort(sorting: SortingState): string | undefined {
  const first = sorting[0];
  if (!first) {
    return undefined;
  }
  return `${first.id}:${first.desc ? "desc" : "asc"}`;
}

/**
 * Keeps only rows whose printings belong to `setSlug`. A row's `setSlugs`
 * covers both accepted and pending candidate printings, so this narrows the
 * Cards and Candidates tabs alike. Returns the original `rows` when no set
 * filter is active.
 * @returns Filtered row array (same order).
 */
export function filterCardsBySet<T extends { setSlugs: string[] }>(
  rows: T[],
  setSlug: string | undefined,
): T[] {
  if (!setSlug) {
    return rows;
  }
  return rows.filter((row) => row.setSlugs.includes(setSlug));
}
