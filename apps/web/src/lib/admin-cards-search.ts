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
 * Keeps only rows whose card belongs to `setSlug` — i.e. where the card's
 * accepted printings (as tracked by `setSlugsByCardSlug`) include the
 * active set. Returns the original `rows` when no set filter is active.
 * @returns Filtered row array (same order).
 */
export function filterCardsBySet<T extends { cardSlug: string | null }>(
  rows: T[],
  setSlug: string | undefined,
  setSlugsByCardSlug: Map<string, string[]>,
): T[] {
  if (!setSlug) {
    return rows;
  }
  return rows.filter((row) =>
    row.cardSlug ? (setSlugsByCardSlug.get(row.cardSlug) ?? []).includes(setSlug) : false,
  );
}
