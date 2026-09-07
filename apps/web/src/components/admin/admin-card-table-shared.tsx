import { useNavigate } from "@tanstack/react-router";
import type {
  RowData,
  Row as TanStackRow,
  SortingState,
  Table as TanStackTable,
  Updater,
} from "@tanstack/react-table";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  FlexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
} from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { useRef, useState } from "react";

import { ariaSort } from "@/components/admin/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useScopeLayoutEffect } from "@/hooks/use-scope-effect";
import { stringifySort } from "@/lib/admin-cards-search";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// Shared between accepted-cards-table.tsx and candidate-cards-table.tsx: both
// tables live on the admin Cards page, sync their sort/filter state to the
// same route's search params, and virtualize their rows the same way.

/**
 * v9 only ships the features registered here. No `filterFns`: the built-in
 * `includesString` misses the catalogue's typographic apostrophes.
 */
export const adminCardTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
});

export type AdminCardTableFeatures = typeof adminCardTableFeatures;

/** Wires a table's `sorting`/`globalFilter` state to the admin Cards route's search params. */
export function useAdminCardsTableUrlSync(sorting: SortingState, globalFilter: string) {
  const navigate = useNavigate({ from: CardsRoute.fullPath });

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    void navigate({
      search: (prev) => ({ ...prev, tableSort: stringifySort(next) }),
      replace: true,
    });
  }

  const handleGlobalFilterChange = (updater: Updater<string>) => {
    const next = typeof updater === "function" ? updater(globalFilter) : updater;
    void navigate({
      search: (prev) => ({ ...prev, q: next === "" ? undefined : next }),
      replace: true,
    });
  };

  return { handleSortingChange, handleGlobalFilterChange };
}

const ROW_HEIGHT = 41;
const OVERSCAN = 20;

/**
 * `scrollMargin` is the tbody's document offset: `useWindowVirtualizer`
 * reports item start/end in document space, which callers correct for in spacer rows.
 */
export function useVirtualizedTableRows(rowCount: number) {
  const tableAnchorRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // A changed row count moves the anchor, so the margin is measured again.
  useScopeLayoutEffect(rowCount, () => {
    const el = tableAnchorRef.current;
    if (el) {
      setScrollMargin(Math.round(el.getBoundingClientRect().top + globalThis.scrollY));
    }
  });

  const { virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: rowCount,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
  });

  return { tableAnchorRef, virtualItems, totalSize, scrollMargin };
}

export function VirtualizedAdminCardTable<TData extends RowData>({
  table,
  rows,
  virtualItems,
  totalSize,
  scrollMargin,
  tableAnchorRef,
  columnWidths,
}: {
  table: TanStackTable<AdminCardTableFeatures, TData>;
  rows: TanStackRow<AdminCardTableFeatures, TData>[];
  virtualItems: VirtualItem[];
  totalSize: number;
  scrollMargin: number;
  tableAnchorRef: RefObject<HTMLTableSectionElement | null>;
  columnWidths: Record<string, string>;
}) {
  return (
    <Table className="min-w-[720px] table-fixed">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                style={{ width: columnWidths[header.id] }}
                aria-sort={
                  header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined
                }
              >
                <FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody ref={tableAnchorRef}>
        {/* Spacer offsets are tbody-relative; virtual items are reported in
            document space, so scrollMargin is subtracted here and added back below. */}
        {virtualItems.length > 0 && (
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- TanStack Virtual spacer row, no semantic content
          <tr style={{ height: virtualItems[0].start - scrollMargin }} />
        )}
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TableRow key={row.id} data-index={virtualRow.index}>
              {/* getAllCells, not getVisibleCells: the latter needs
                  columnVisibilityFeature, which these tables don't register. */}
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="whitespace-normal">
                  <FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          );
        })}
        {virtualItems.length > 0 && (
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- TanStack Virtual spacer row, no semantic content
          <tr
            style={{
              height: totalSize - (virtualItems.at(-1)?.end ?? 0) + scrollMargin,
            }}
          />
        )}
      </TableBody>
    </Table>
  );
}
