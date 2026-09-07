import type { CellData, Column, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import type { AdminCardTableFeatures } from "@/components/admin/admin-card-table-shared";
import { Pressable } from "@/components/ui/pressable";

export type SortedState = false | "asc" | "desc";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * `aria-sort` belongs on the `th`, not the control inside it: the table that
 * renders the header cell sets this, not {@link SortHeaderButton}.
 */
export function ariaSort(sorted: SortedState): "ascending" | "descending" | "none" {
  if (sorted === false) {
    return "none";
  }
  return ARIA_SORT[sorted];
}

function SortIcon({ sorted }: { sorted: SortedState }) {
  if (sorted === "asc") {
    return <ArrowUpIcon className="text-foreground h-3.5 w-3.5" />;
  }
  if (sorted === "desc") {
    return <ArrowDownIcon className="text-foreground h-3.5 w-3.5" />;
  }
  return <ChevronsUpDownIcon className="text-muted-foreground/50 h-3.5 w-3.5" />;
}

/**
 * Every admin table sorts through this one control, so headers stay
 * keyboard-reachable and focus-ringed wherever they are rendered.
 */
export function SortHeaderButton({
  sorted,
  onClick,
  children,
}: {
  sorted: SortedState;
  onClick?: ComponentProps<"button">["onClick"];
  children: ReactNode;
}) {
  return (
    <Pressable className="inline-flex items-center gap-1 rounded-sm select-none" onClick={onClick}>
      {children}
      <SortIcon sorted={sorted} />
    </Pressable>
  );
}

// Pinned to the admin card tables' feature set: `getCanSort` and friends only
// exist on a column whose table registered `rowSortingFeature`.
export function SortableHeader<TData extends RowData, TValue extends CellData = CellData>({
  column,
  label,
}: {
  column: Column<AdminCardTableFeatures, TData, TValue>;
  label: string;
}) {
  if (!column.getCanSort()) {
    return label;
  }
  return (
    <SortHeaderButton sorted={column.getIsSorted()} onClick={column.getToggleSortingHandler()}>
      {label}
    </SortHeaderButton>
  );
}
