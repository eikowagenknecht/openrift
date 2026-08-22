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
import { useLayoutEffect, useRef, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stringifySort } from "@/lib/admin-cards-search";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// Shared between accepted-cards-table.tsx and candidate-cards-table.tsx: both
// tables live on the admin Cards page, sync their sort/filter state to the
// same route's search params, and virtualize their rows the same way.

// ---------------------------------------------------------------------------
// Feature set
// ---------------------------------------------------------------------------

/**
 * Both admin card tables sort and global-filter, and nothing else. No
 * pagination, no selection, no pinning. v9 only ships the features registered
 * here, so the rest never reaches the bundle.
 *
 * `globalFilteringFeature` and the filtered row model both build on
 * `columnFilteringFeature`, hence its presence even though no column carries
 * its own filter. The registry keys are the only strings the `sortFn` column
 * and table options accept.
 *
 * No `filterFns` registry: both tables pass a `globalFilterFn` function that
 * calls `matchesCardQuery`, so a typed apostrophe still finds the catalogue's
 * typographic one. The built-in `includesString` compares raw lowercased text
 * and misses those, which is why nothing here registers it.
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

// ---------------------------------------------------------------------------
// Sort / global filter URL sync
// ---------------------------------------------------------------------------

/**
 * Wires a table's `sorting`/`globalFilter` state to the admin Cards route's
 * search params, so react-table state changes push a URL update instead of
 * local state.
 * @param sorting Current sorting state, as read from `CardsRoute.useSearch`.
 * @param globalFilter Current global filter string, as read from `CardsRoute.useSearch`.
 * @returns `onSortingChange` / `onGlobalFilterChange` handlers for `useTable`.
 */
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

// ---------------------------------------------------------------------------
// Row virtualization
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 41;
const OVERSCAN = 20;

/**
 * Window-virtualizes a table's rows and tracks the tbody's document offset.
 * Without virtualization, clearing the search filter renders 2000+ rows from
 * scratch and freezes the browser for seconds. `scrollMargin` is the tbody's
 * document offset — `useWindowVirtualizer` reports item start/end in document
 * space (offset by scrollMargin), which callers correct for in spacer rows.
 * @param rowCount Number of rows currently in the table's row model.
 * @returns The tbody ref to attach, plus the virtualizer's items/total size/scroll margin.
 */
export function useVirtualizedTableRows(rowCount: number) {
  const tableAnchorRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = tableAnchorRef.current;
    if (!el) {
      return;
    }
    setScrollMargin(Math.round(el.getBoundingClientRect().top + globalThis.scrollY));
  }, [rowCount]);

  const { virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: rowCount,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
  });

  return { tableAnchorRef, virtualItems, totalSize, scrollMargin };
}

// ---------------------------------------------------------------------------
// Virtualized table rendering
// ---------------------------------------------------------------------------

/**
 * Renders a react-table instance's header and virtualized rows inside a
 * `table-fixed` layout, using the leading/trailing spacer rows that
 * `useVirtualizedTableRows` requires.
 * @param props Table instance, its row model, virtualizer output, and per-column widths.
 * @returns The `<Table>` element.
 */
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
              <TableHead key={header.id} style={{ width: columnWidths[header.id] }}>
                <FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody ref={tableAnchorRef}>
        {/*
          Spacer offsets are tbody-relative. useWindowVirtualizer reports
          virtualItem.start/.end in document space (offset by scrollMargin),
          so subtract scrollMargin from the leading spacer and add it back
          into the trailing spacer so together they reserve exactly
          `totalSize` (the virtualized region's own height).
        */}
        {virtualItems.length > 0 && (
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- TanStack Virtual spacer row, no semantic content
          <tr style={{ height: virtualItems[0].start - scrollMargin }} />
        )}
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TableRow key={row.id} data-index={virtualRow.index}>
              {/* getAllCells, not getVisibleCells: the latter belongs to
                  columnVisibilityFeature, which these tables don't register.
                  Both yield the same cells while no column can hide, but
                  adding columnVisibilityFeature means switching back in the
                  same change — getHeaderGroups() filters by visibility on its
                  own, so the headers would shrink while the cells wouldn't. */}
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
