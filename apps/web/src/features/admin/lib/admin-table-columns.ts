import type { SortingState } from "@tanstack/react-table";

import type { ServerSort } from "@/features/admin/lib/admin-table-types";

export interface AdminSortableColumn {
  header: string;
  id?: string;
  sortKey?: string;
}

export function columnId(col: AdminSortableColumn): string {
  return col.id ?? col.header;
}

export function serverSortingState(
  columns: AdminSortableColumn[],
  serverSort: ServerSort,
): SortingState {
  const column = columns.find((col) => col.sortKey === serverSort.key);
  if (column === undefined) {
    return [];
  }
  return [{ id: columnId(column), desc: serverSort.direction === "desc" }];
}
