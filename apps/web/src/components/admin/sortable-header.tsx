import type { Column, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

export function SortableHeader<TData extends RowData>({
  column,
  label,
}: {
  column: Column<TData>;
  label: string;
}) {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  if (!canSort) {
    return label;
  }
  return (
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
