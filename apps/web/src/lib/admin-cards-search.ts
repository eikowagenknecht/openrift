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
