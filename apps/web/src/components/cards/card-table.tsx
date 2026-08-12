import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { buildGroups } from "@/lib/card-groups";
import type { CardGroup } from "@/lib/card-groups";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";

import type { GroupInfo, VRow } from "./card-grid-types";
import type { ActionsColumn } from "./card-table-row";
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

// Data subscriptions (live owned-count, per-cell) live inside the actions
// component the surface passes through `actionsCell` — see
// CatalogTableActions / CollectionTableActions / StaticCountTableActions.
// The actions element identity changes with each parent render (it closes
// over parent state), but the memoized children inside the actions
// component are cached by React Compiler, so the re-render cost stays
// per-row-local.
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

// Floating "current group" pill for the table's sticky overlay. Memoized with a
// primitive `groupId` + a stable `onSelect` (scrollToGroup reads from refs) so
// it doesn't re-render on every scroll-driven CardTable render. Mirrors the
// grid's GroupHeaderLabel but appends the card count, matching the table's
// inline group headers.
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
      className="pointer-events-auto h-auto gap-3 px-3 py-1 text-sm font-normal"
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
  /** Section order for the "collection" axis. Only /collections supplies it. */
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  /** Window-scroll offset for sticky elements above the table (header + toolbar). */
  stickyOffset?: number;
  /** Width + presence of the rightmost actions column. See {@link ActionsColumn}. */
  actionsColumn: ActionsColumn;
  /**
   * JSX element rendered inside the actions cell for each row. Per-row data
   * (`printing`, `itemId`) is injected via cloneElement, so the actions
   * component should declare those as optional props.
   */
  actionsCell?: ReactElement<TableRowSlotProps>;
  /** Label for the rightmost column header. Defaults to "Owned". */
  actionsLabel?: string;
  /**
   * Optional wrapper element applied around each data row. Surfaces use this
   * for drag wiring — e.g. /collections wraps rows in `<DraggableCard>` so the
   * table row becomes a drag handle alongside grid cells. Per-row data is
   * injected via cloneElement and the row node is provided as children.
   */
  rowWrapper?: ReactElement<TableRowSlotProps & { children?: ReactNode }>;
}

let cachedScrollMargin = 0;

/**
 * Virtualized table view for the card browser. Mirrors CardGrid's grouping +
 * window-scroll virtualization but renders rows instead of grid cells. Each
 * row hovers a full-size preview via HoverCard, and the rightmost column
 * surfaces whatever {@link CardTableProps.renderActions} returns — typically
 * a CatalogTableActions / CollectionTableActions / DeckTableActions /
 * StaticCountTableActions cell.
 *
 * @returns The rendered virtualized table.
 */
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
}: CardTableProps) {
  const { orders, labels } = useEnumOrders();
  // Resolve the sticky offset in the body (not as a default param) so the live
  // header measurement settles after hydration instead of mismatching the SSR
  // markup. See useHeaderHeight.
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
      // The non-sticky column header sits between this container's top and the
      // virtualized rows, so the rows' document offset is one header-height
      // lower. scrollMargin must equal that row offset, or scrollToIndex (pill
      // click, scrubber release) and the active-group threshold land a row off.
      // The grid has no column header, so its scrollMargin needs no such adjustment.
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

  // Tracks the group whose header has scrolled up out of view, so the floating
  // pill below the toolbar can show the current set as you scroll.
  const activeHeaderRow = useStickyHeader({
    multipleGroups,
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    stickyOffset,
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

  // Reads only from mirror refs so the React Compiler keeps this reference
  // stable across scroll-driven re-renders — GroupStickyLabel's memoized
  // onSelect prop then doesn't bust on every tick.
  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (row) => row.kind === "header" && row.group.id === groupId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  // Only drop the grouped column when group headers are actually on screen
  // (more than one group). With a single group the headers are suppressed, so
  // that column is the only place its value shows — keep it.
  const groupingColumn = multipleGroups ? groupBy : undefined;
  const columns = getCardTableColumns(actionsColumn, groupingColumn);
  const minWidth = getCardTableMinWidth(actionsColumn, groupingColumn);

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <CardViewerEmptyState totalItems={totalItems} />
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
      {/* Floating group pill — pins below the toolbar as you scroll. It sits
          outside the horizontal-scroll wrapper below so CSS sticky references
          the window rather than that scroll container (which would trap it).
          The column header inside the wrapper stays non-sticky for now. */}
      <div className="sticky z-20 h-0" style={{ top: stickyOffset }}>
        {multipleGroups && activeHeaderRow && (
          <div className="pointer-events-none flex justify-center pt-2">
            <GroupStickyLabel
              slug={activeHeaderRow.group.slug}
              name={activeHeaderRow.group.name}
              count={activeHeaderRow.cardCount}
              groupId={activeHeaderRow.group.id}
              onSelect={scrollToGroup}
            />
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
