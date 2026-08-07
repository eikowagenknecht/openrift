import type { CellData, Column, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import type { AdminCardTableFeatures } from "@/components/admin/admin-card-table-shared";

// Pinned to the admin card tables' feature set: `getCanSort` and friends only
// exist on a column whose table registered `rowSortingFeature`.
export function SortableHeader<TData extends RowData, TValue extends CellData = CellData>({
  column,
  label,
}: {
  column: Column<AdminCardTableFeatures, TData, TValue>;
  label: string;
}) {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  if (!canSort) {
    return label;
  }
  return (
    // oxlint-disable-next-line react/forbid-elements -- this IS the shared sort-header primitive (admin tables)
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 select-none"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted ? (
        sorted === "asc" ? (
          <ArrowUpIcon className="text-foreground inline h-3.5 w-3.5" />
        ) : (
          <ArrowDownIcon className="text-foreground inline h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDownIcon className="text-muted-foreground/50 inline h-3.5 w-3.5" />
      )}
    </button>
  );
}
