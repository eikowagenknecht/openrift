import type { RowData, Table as ReactTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";

// Window-virtualized data table rendered as an ARIA grid of divs (not a real
// <table>). `directDomUpdates` writes the container height and each row's `top`
// straight to the DOM, re-rendering React only when the visible index range
// changes. That keeps it compatible with React Compiler without the
// `"use no memo"` workaround a native-<table> virtualizer needs — the option
// requires `position: absolute` items, which a <tr> can't be.
// See https://github.com/TanStack/virtual/issues/736

interface VirtualDataTableProps<TData extends RowData> {
  /** A configured TanStack Table instance (sorting/filtering applied upstream). */
  table: ReactTable<TData>;
  /**
   * Per-column-id track sizes (e.g. `"25%"`, `"140px"`). Columns without an
   * entry take an equal share of the remaining width via `minmax(0, 1fr)`.
   */
  columnWidths: Record<string, string>;
  /** Initial per-row size estimate; rows are measured via `measureElement`. */
  rowHeight: number;
  /** Rows rendered beyond the visible range on each side. */
  overscan?: number;
  /** Minimum content width before horizontal scrolling kicks in. */
  minWidth?: number;
}

export function VirtualDataTable<TData extends RowData>({
  table,
  columnWidths,
  rowHeight,
  overscan = 20,
  minWidth = 720,
}: VirtualDataTableProps<TData>) {
  const rows = table.getRowModel().rows;

  // Build the grid template from the live column order so it never drifts out
  // of sync with the header/cell ordering.
  const gridTemplateColumns = table
    .getVisibleLeafColumns()
    .map((column) => columnWidths[column.id] ?? "minmax(0, 1fr)")
    .join(" ");

  // scrollMargin is the body container's document offset. useWindowVirtualizer
  // reports item start/end in document space (offset by scrollMargin) and
  // subtracts it again when writing each row's `top`, so positions land
  // relative to the container.
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    setScrollMargin(Math.round(element.getBoundingClientRect().top + globalThis.scrollY));
  }, [rows.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
    directDomUpdates: true,
    // "position" (writes `top`) rather than "transform": rows hold interactive
    // cells (links, sort buttons, accept actions) and "position" avoids giving
    // every row its own stacking context.
    directDomUpdatesMode: "position",
  });

  // The body container needs both our ref (to measure scrollMargin) and the
  // virtualizer's containerRef (so it can write the total height directly).
  const setBodyRef = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    virtualizer.containerRef(node);
  };

  return (
    <div
      role="table"
      aria-rowcount={rows.length + 1}
      className="relative w-full overflow-x-auto text-sm"
    >
      <div style={{ minWidth }}>
        <div role="rowgroup">
          {table.getHeaderGroups().map((headerGroup) => (
            <div
              key={headerGroup.id}
              role="row"
              aria-rowindex={1}
              className="grid border-b"
              style={{ gridTemplateColumns }}
            >
              {headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  role="columnheader"
                  className="text-foreground flex h-10 min-w-0 items-center px-2 font-medium"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div ref={setBodyRef} role="rowgroup" className="relative">
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                className="hover:bg-muted/50 grid border-b transition-colors"
                style={{ position: "absolute", left: 0, width: "100%", gridTemplateColumns }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} role="cell" className="flex min-w-0 items-center p-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
