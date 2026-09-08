import type { SortingState, Updater } from "@tanstack/react-table";
import { functionalUpdate } from "@tanstack/react-table";
import { useState } from "react";

import type { AdminSortableColumn } from "@/features/admin/lib/admin-table-columns";
import { columnId, serverSortingState } from "@/features/admin/lib/admin-table-columns";
import type { ServerSort } from "@/features/admin/lib/admin-table-types";

export function useAdminSorting({
  columns,
  defaultSort,
  serverSort,
}: {
  columns: AdminSortableColumn[];
  defaultSort?: { column: string; direction: "asc" | "desc" };
  serverSort?: ServerSort;
}) {
  const [localSorting, setLocalSorting] = useState<SortingState>(
    defaultSort ? [{ id: defaultSort.column, desc: defaultSort.direction === "desc" }] : [],
  );

  const sorting = serverSort === undefined ? localSorting : serverSortingState(columns, serverSort);

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = functionalUpdate(updater, sorting);
    if (serverSort === undefined) {
      setLocalSorting(next);
      return;
    }
    const first = next[0];
    if (first === undefined) {
      serverSort.onChange({ key: null, direction: "asc" });
      return;
    }
    const key = columns.find((col) => columnId(col) === first.id)?.sortKey ?? null;
    serverSort.onChange({ key, direction: first.desc ? "desc" : "asc" });
  }

  return { sorting, handleSortingChange };
}
