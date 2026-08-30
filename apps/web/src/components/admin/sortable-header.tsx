import type { CellData, Column, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import type { AdminCardTableFeatures } from "@/components/admin/admin-card-table-shared";
import { Pressable } from "@/components/ui/pressable";

/** What a column reports about its place in the sort. */
export type SortedState = false | "asc" | "desc";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * A sortable header's `aria-sort`, which is how a screen reader announces the
 * order. It belongs on the `th` rather than on the control inside it, so the
 * table that renders the header cell sets it, not {@link SortHeaderButton}.
 *
 * @returns The `aria-sort` value for a column in this state.
 */
export function ariaSort(sorted: SortedState): "ascending" | "descending" | "none" {
  if (sorted === false) {
    return "none";
  }
  return ARIA_SORT[sorted];
}

/**
 * The arrow beside a sortable header's label.
 *
 * @returns The direction arrow, or the neutral chevrons when unsorted.
 */
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
 * The clickable part of a sortable header: the label the caller passes, plus
 * the state arrow. Every admin table sorts through this one control, so the
 * headers stay keyboard-reachable and focus-ringed wherever they are rendered.
 *
 * @returns The header's sort control.
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
/**
 * A react-table column's header, for the admin card tables that build their
 * columns as TanStack `ColumnDef`s rather than through `AdminTable`.
 *
 * @returns The sort control, or the bare label on a column that cannot sort.
 */
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
