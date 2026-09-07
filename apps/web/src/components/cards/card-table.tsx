import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { OrnamentRule } from "@/components/ui/ornament";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHeaderHeight } from "@/hooks/use-header-height";
import type { GroupInfo } from "@/lib/card-group-types";
import { buildGroups } from "@/lib/card-groups";
import type { CardGroup } from "@/lib/card-groups";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { ActionsColumn } from "@/lib/collection-table";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";

import type { VRow } from "./card-grid-types";
import {
  CARD_TABLE_HEADER_HEIGHT,
  CARD_TABLE_ROW_HEIGHT,
  CardTableGroupHeader,
  CardTableHeader,
  CardTableRow,
  getCardTableColumns,
  getCardTableMinWidth,
} from "./card-table-row";
import { CardViewerEmptyState } from "./card-viewer-empty-state";
import { computeRowStarts } from "./compute-row-starts";
import { ScrollIndicator } from "./scroll-indicator";
import { useStickyHeader } from "./use-sticky-header";

const GAP = 0;

function buildVirtualRows(groups: CardGroup[]): VRow[] {
  const showHeaders = groups.length > 1;
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", group: group.group, cardCount: group.items.length });
    }
    for (const item of group.items) {
      rows.push({ kind: "cards", items: [item], cardsBefore });
      cardsBefore += 1;
    }
  }
  return rows;
}

// actionsCell's element identity changes every parent render, but its own
// memoized children are cached by React Compiler, so re-render stays row-local.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
const DataRow = memo(function DataRow({
  printing,
  itemId,
  isSelected,
  actionsColumn,
  columns,
  groupBy,
  cardTypeLabels,
  superTypeLabels,
  rarityLabels,
  setNameBySlug,
  actionsCell,
}: {
  printing: Printing;
  itemId: string;
  isSelected: boolean;
  actionsColumn: ActionsColumn;
  columns: string;
  groupBy?: GroupByField;
  cardTypeLabels: Record<string, string>;
  superTypeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  setNameBySlug: Map<string, string>;
  actionsCell?: ReactNode;
}) {
  return (
    <CardTableRow
      printing={printing}
      itemId={itemId}
      isSelected={isSelected}
      actionsColumn={actionsColumn}
      columns={columns}
      groupBy={groupBy}
      cardTypeLabels={cardTypeLabels}
      superTypeLabels={superTypeLabels}
      rarityLabels={rarityLabels}
      setNameBySlug={setNameBySlug}
      onRowClick={(p) => useCardRowActionsStore.getState().handlers.onRowClick?.(p, itemId)}
      actionsCell={actionsCell}
    />
  );
});

// Memoized with a primitive groupId + stable onSelect so it doesn't re-render
// on every scroll-driven CardTable render.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
const GroupStickyLabel = memo(function GroupStickyLabel({
  slug,
  name,
  count,
  groupId,
  onSelect,
}: {
  slug: string;
  name: string;
  count: number;
  groupId: string;
  onSelect: (groupId: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="glass-pill"
      className="pointer-events-auto h-auto gap-3 rounded-lg px-3 py-1 text-sm font-normal"
      onClick={() => onSelect(groupId)}
    >
      {slug && <span className="text-muted-foreground font-medium">{slug}</span>}
      <span className="font-semibold">{name}</span>
      <span className="text-muted-foreground tabular-nums">({count})</span>
    </Button>
  );
});

/** Per-row props that `actionsCell` and `rowWrapper` elements receive via cloneElement. */
export interface TableRowSlotProps {
  printing?: Printing;
  itemId?: string;
}

interface CardTableProps {
  items: CardViewerItem[];
  totalItems: number;
  setOrder?: GroupInfo[];
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  stickyOffset?: number;
  actionsColumn: ActionsColumn;
  actionsCell?: ReactElement<TableRowSlotProps>;
  actionsLabel?: string;
  rowWrapper?: ReactElement<TableRowSlotProps & { children?: ReactNode }>;
  noResultsDescription?: ReactNode;
}

let cachedScrollMargin = 0;

export function CardTable({
  items,
  totalItems,
  setOrder,
  collectionOrder,
  groupBy = "set",
  groupDir = "asc",
  selectedItemId,
  stickyOffset: stickyOffsetProp,
  actionsColumn,
  actionsCell,
  actionsLabel,
  rowWrapper,
  noResultsDescription,
}: CardTableProps) {
  const { orders, labels } = useEnumOrders();
  // Not a default param: the live header measurement must settle after
  // hydration, or it mismatches the SSR markup.
  const headerHeight = useHeaderHeight();
  const stickyOffset = stickyOffsetProp ?? headerHeight;

  const containerRef = useRef<HTMLDivElement>(null);

  const groups = buildGroups(items, groupBy, setOrder, groupDir, orders, labels, collectionOrder);
  const multipleGroups = groups.length > 1;
  const virtualRows = buildVirtualRows(groups);
  const setNameBySlug = new Map((setOrder ?? []).map((info) => [info.slug, info.name]));

  const estimateRowHeight = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return CARD_TABLE_ROW_HEIGHT;
    }
    return row.kind === "header" ? CARD_TABLE_HEADER_HEIGHT : CARD_TABLE_ROW_HEIGHT;
  };

  const rowStarts = computeRowStarts(virtualRows, estimateRowHeight, GAP);

  const [scrollMargin, setScrollMargin] = useState(() => cachedScrollMargin);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      // The non-sticky column header pushes the rows one header-height below
      // this container's top; scrollMargin must include it or scrollToIndex lands a row off.
      const next =
        Math.round(el.getBoundingClientRect().top + globalThis.scrollY) + CARD_TABLE_HEADER_HEIGHT;
      cachedScrollMargin = next;
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const { virtualizer, virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: virtualRows.length,
    estimateSize: estimateRowHeight,
    gap: GAP,
    scrollMargin,
    scrollPaddingStart: stickyOffset,
    overscan: 8,
  });

  const virtualizerRef = useRef(virtualizer);
  const virtualRowsRef = useRef(virtualRows);
  const stickyOffsetRef = useRef(stickyOffset);
  useEffect(() => {
    virtualizerRef.current = virtualizer;
    virtualRowsRef.current = virtualRows;
    stickyOffsetRef.current = stickyOffset;
  });

  const activeHeaderRow = useStickyHeader({
    multipleGroups,
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    stickyOffset,
    headerHeight: CARD_TABLE_HEADER_HEIGHT,
  });

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    const rows = virtualRowsRef.current;
    const rowIndex = rows.findIndex(
      (row) =>
        row.kind === "cards" &&
        row.items.some((item) => item.id === selectedItemId || item.printing.id === selectedItemId),
    );
    if (rowIndex === -1) {
      return;
    }
    const vItems = virtualizerRef.current.getVirtualItems();
    const vItem = vItems.find((vi) => vi.index === rowIndex);
    if (vItem) {
      const viewportTop = globalThis.scrollY + stickyOffsetRef.current;
      const viewportBottom = globalThis.scrollY + globalThis.innerHeight;
      if (vItem.start >= viewportTop && vItem.start + vItem.size <= viewportBottom) {
        return;
      }
    }
    virtualizerRef.current.scrollToIndex(rowIndex, { align: "start" });
  }, [selectedItemId]);

  // Reads only from mirror refs so React Compiler keeps this reference stable
  // across scroll-driven re-renders; GroupStickyLabel's onSelect prop stays intact.
  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (row) => row.kind === "header" && row.group.id === groupId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  // With a single group, headers are suppressed, so the column is the only
  // place its value shows.
  const groupingColumn = multipleGroups ? groupBy : undefined;
  const columns = getCardTableColumns(actionsColumn, groupingColumn);
  const minWidth = getCardTableMinWidth(actionsColumn, groupingColumn);

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <CardViewerEmptyState totalItems={totalItems} noResultsDescription={noResultsDescription} />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <ScrollIndicator
        virtualRows={virtualRows}
        rowStarts={rowStarts}
        virtualizer={virtualizer}
        scrollMargin={scrollMargin}
        multipleGroups={multipleGroups}
        stickyOffset={stickyOffset}
      />
      {/* Outside the horizontal-scroll wrapper below, so CSS sticky references
          the window instead of that scroll container (which would trap it). */}
      <div className="sticky z-20 h-0" style={{ top: stickyOffset }}>
        {multipleGroups && activeHeaderRow && (
          <div className="pointer-events-none flex justify-center pt-2">
            <OrnamentRule fade="tips" className="w-72 max-w-full">
              <GroupStickyLabel
                slug={activeHeaderRow.group.slug}
                name={activeHeaderRow.group.name}
                count={activeHeaderRow.cardCount}
                groupId={activeHeaderRow.group.id}
                onSelect={scrollToGroup}
              />
            </OrnamentRule>
          </div>
        )}
      </div>
      <div className="overflow-x-auto overflow-y-clip">
        <div style={{ minWidth }}>
          <CardTableHeader
            columns={columns}
            actionsColumn={actionsColumn}
            groupBy={groupingColumn}
            bordered={!multipleGroups}
            actionsLabel={actionsLabel}
          />
          <div style={{ height: `${totalSize}px`, position: "relative" }}>
            {virtualItems.map((vItem) => {
              const row = virtualRows[vItem.index];
              if (!row) {
                return null;
              }
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start - scrollMargin}px)`,
                  }}
                >
                  {row.kind === "header" ? (
                    multipleGroups ? (
                      <CardTableGroupHeader
                        columns={columns}
                        slug={row.group.slug}
                        name={row.group.name}
                        count={row.cardCount}
                        onClick={() => scrollToGroup(row.group.id)}
                      />
                    ) : null
                  ) : (
                    row.items.map((item) => {
                      const cellForRow = actionsCell
                        ? cloneElement(actionsCell, { printing: item.printing, itemId: item.id })
                        : undefined;
                      const rowNode = (
                        <DataRow
                          printing={item.printing}
                          itemId={item.id}
                          isSelected={
                            item.id === selectedItemId || item.printing.id === selectedItemId
                          }
                          actionsColumn={actionsColumn}
                          columns={columns}
                          groupBy={groupingColumn}
                          cardTypeLabels={labels.cardTypes}
                          superTypeLabels={labels.superTypes}
                          rarityLabels={labels.rarities}
                          setNameBySlug={setNameBySlug}
                          actionsCell={cellForRow}
                        />
                      );
                      if (!rowWrapper) {
                        return <Fragment key={item.id}>{rowNode}</Fragment>;
                      }
                      return (
                        <Fragment key={item.id}>
                          {cloneElement(
                            rowWrapper,
                            { printing: item.printing, itemId: item.id },
                            rowNode,
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
