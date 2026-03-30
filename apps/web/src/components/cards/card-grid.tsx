import type { Printing } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { SearchX, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import {
  APP_HEADER_HEIGHT,
  BUTTON_PAD,
  CARD_ASPECT,
  FALLBACK_ROW_HEIGHT,
  GAP,
  HEADER_CONTENT_HEIGHT,
  HEADER_PB,
  HEADER_PT,
  LABEL_WRAPPER_MT,
  META_LABEL_PY,
  META_LINE_GAP,
  META_LINE_HEIGHT,
  PRICE_LINE_HEIGHT,
  PRICE_MT,
} from "./card-grid-constants";
import { CardGridDebug } from "./card-grid-debug";
import type { SetInfo, VRow } from "./card-grid-types";
import { ScrollIndicator } from "./scroll-indicator";
import { useGridKeyboardNav } from "./use-grid-keyboard-nav";
import { useStickyHeader } from "./use-sticky-header";

export type { SetInfo } from "./card-grid-types";

interface CardGroup {
  set: SetInfo;
  items: CardViewerItem[];
}

function groupItemsBySet(items: CardViewerItem[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = Map.groupBy(items, (item) => item.printing.setId);

  return setOrder.flatMap((setInfo) => {
    const setItems = bySet.get(setInfo.id);
    return setItems ? [{ set: setInfo, items: setItems }] : [];
  });
}

function buildVirtualRows(groups: CardGroup[], columns: number): VRow[] {
  const showHeaders = groups.length > 1;
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", set: group.set, cardCount: group.items.length });
    }
    for (let i = 0; i < group.items.length; i += columns) {
      const items = group.items.slice(i, i + columns);
      rows.push({ kind: "cards", items, cardsBefore });
      cardsBefore += items.length;
    }
  }
  return rows;
}

/** All fields are always visible — height is constant. */
const LABEL_HEIGHT =
  LABEL_WRAPPER_MT +
  META_LABEL_PY +
  META_LINE_HEIGHT +
  META_LINE_GAP +
  META_LINE_HEIGHT +
  PRICE_MT +
  PRICE_LINE_HEIGHT;

/**
 * Builds a prefix-sum array of Y-offsets so `rowStarts[i]` is the pixel
 * position where row `i` begins in the virtual scroll container.
 *
 * @returns Cumulative start offsets (one per row).
 */
function computeRowStarts(
  virtualRows: VRow[],
  estimateRowHeight: (index: number) => number,
): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < virtualRows.length; i++) {
    starts.push(acc);
    acc += estimateRowHeight(i) + GAP;
  }
  return starts;
}

function SetHeaderLabel({
  slug,
  name,
  onClick,
  className,
}: {
  slug: string;
  name: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn("flex cursor-pointer flex-row gap-3 text-sm", className)}
      onClick={onClick}
    >
      <span className="text-muted-foreground font-medium">{slug}</span>
      <span className="font-semibold">{name}</span>
    </button>
  );
}

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
// ⚠ pt-4 / pb-2 are mirrored as HEADER_PT / HEADER_PB above — update both together
const HeaderRow = memo(function HeaderRow({
  row,
  onScrollToGroup,
}: {
  row: VRow & { kind: "header" };
  onScrollToGroup: (setId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-2">
      <div className="bg-border h-px flex-1" />
      <SetHeaderLabel
        slug={row.set.slug}
        name={row.set.name}
        onClick={() => onScrollToGroup(row.set.id)}
      />
      <div className="bg-border h-px flex-1" />
    </div>
  );
});

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
const CardRowContent = memo(function CardRowContent({
  row,
  columns,
  labelHeight,
  selectedItemId,
  flashCardId,
  cardWidth,
  eagerCount,
  renderCard,
}: {
  row: VRow & { kind: "cards" };
  columns: number;
  labelHeight: number;
  selectedItemId?: string;
  flashCardId: string | null;
  cardWidth: number;
  eagerCount: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
}) {
  // Track whether this row has been fully rendered before. Once rendered,
  // keep showing real content even during scroll (memo prevents re-render anyway).
  // Defer full rendering: show a lightweight placeholder on mount, then swap in
  // real content when the browser is idle. During fast scroll the browser stays
  // busy so placeholders persist; during slow scroll or once stopped, the idle
  // callback fires quickly and real content appears.
  const [deferred, setDeferred] = useState(true);
  useEffect(() => {
    if (!deferred) {
      return;
    }
    // Safari doesn't support requestIdleCallback. Fall back to
    // rAF + setTimeout so the callback runs after the next frame paints,
    // giving scroll/layout priority — closer to "when idle" behavior.
    if (typeof globalThis.requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setDeferred(false), { timeout: 300 });
      return () => cancelIdleCallback(id);
    }
    let timerId: ReturnType<typeof setTimeout>;
    const rafId = requestAnimationFrame(() => {
      timerId = setTimeout(() => setDeferred(false), 0);
    });
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [deferred]);

  const gridStyle = {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${GAP}px`,
  };

  if (deferred) {
    return (
      <div style={gridStyle}>
        {row.items.map((item) => (
          // ⚠ p-1.5 mirrors BUTTON_PAD in card-grid-constants — update both together
          <div key={item.id} className="rounded-lg p-1.5">
            <div className="bg-muted/40 rounded-lg" style={{ aspectRatio: `1 / ${CARD_ASPECT}` }} />
            {labelHeight > 0 && <div style={{ height: labelHeight }} />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      {row.items.map((item, colIndex) => {
        const flatIndex = row.cardsBefore + colIndex;
        return (
          <Fragment key={item.id}>
            {renderCard(item, {
              isSelected: item.id === selectedItemId || item.printing.id === selectedItemId,
              isFlashing: item.id === flashCardId || item.printing.id === flashCardId,
              cardWidth,
              priority: flatIndex < eagerCount,
            })}
          </Fragment>
        );
      })}
    </div>
  );
});

interface CardGridProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: SetInfo[];
  selectedItemId?: string;
  keyboardNavItemId?: string;
  onItemClick?: (printing: Printing) => void;
  siblingPrintings?: Printing[];
  /** Extra height added to each card row (e.g. add-mode strip). */
  addStripHeight?: number;
}

export function CardGrid({
  items,
  totalItems,
  renderCard,
  setOrder,
  selectedItemId,
  keyboardNavItemId,
  onItemClick,
  siblingPrintings,
  addStripHeight = 0,
}: CardGridProps) {
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setPhysicalMax = useDisplayStore((s) => s.setPhysicalMax);
  const setPhysicalMin = useDisplayStore((s) => s.setPhysicalMin);
  const setAutoColumns = useDisplayStore((s) => s.setAutoColumns);

  const adminSettings = useAdminSettings();
  const debugOverlayEnabled = adminSettings?.debugOverlay === true;

  // ── Responsive column layout ─────────────────────────────────────
  // Measures the container and computes how many columns fit.
  // Writes physical min/max/auto back to the store for the column slider UI.
  const { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth } =
    useResponsiveColumns(maxColumns);

  useLayoutEffect(() => {
    setPhysicalMax(physicalMax);
    setPhysicalMin(physicalMin);
    setAutoColumns(autoColumns);
  }, [physicalMax, physicalMin, autoColumns, setPhysicalMax, setPhysicalMin, setAutoColumns]);

  const thumbWidth = (containerWidth - GAP * (columns - 1)) / columns;

  // ── Group items by set, then flatten into virtual rows ───────────
  const groups = setOrder
    ? groupItemsBySet(items, setOrder)
    : [{ set: { id: "_all", slug: "", name: "" }, items }];
  const multipleGroups = groups.length > 1;
  const virtualRowsCacheRef = useRef<{
    items: CardViewerItem[];
    setOrder: SetInfo[] | undefined;
    columns: number;
    rows: VRow[];
  }>({ items: [], setOrder: undefined, columns: 0, rows: [] });
  if (
    virtualRowsCacheRef.current.items !== items ||
    virtualRowsCacheRef.current.setOrder !== setOrder ||
    virtualRowsCacheRef.current.columns !== columns
  ) {
    virtualRowsCacheRef.current = {
      items,
      setOrder,
      columns,
      rows: buildVirtualRows(groups, columns),
    };
  }
  const virtualRows = virtualRowsCacheRef.current.rows;

  const labelHeight = LABEL_HEIGHT;

  const estimateRowHeight = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return FALLBACK_ROW_HEIGHT;
    }
    if (row.kind === "header") {
      return HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;
    }
    const imgHeight = (thumbWidth - BUTTON_PAD * 2) * CARD_ASPECT;
    return Math.round(imgHeight + labelHeight + BUTTON_PAD * 2 + addStripHeight);
  };

  // Precompute cumulative start offsets for each row.
  const rowStarts = computeRowStarts(virtualRows, estimateRowHeight);

  // ── Scroll margin (container's document offset) ────────────────────
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    setScrollMargin(Math.round(el.getBoundingClientRect().top + globalThis.scrollY));
  }, [items, containerRef]);

  // ── Virtualizer ────────────────────────────────────────────────────
  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize: estimateRowHeight,
    gap: GAP,
    scrollMargin,
    scrollPaddingStart: APP_HEADER_HEIGHT,
    overscan: 3,
  });

  // ── Extracted hooks ────────────────────────────────────────────────
  const activeHeaderRow = useStickyHeader({
    multipleGroups,
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
  });

  useGridKeyboardNav({
    selectedCardId: keyboardNavItemId ?? selectedItemId,
    virtualRows,
    columns,
    onCardClick: onItemClick,
    virtualizer,
    siblingPrintings,
  });

  // ── Selected-card scroll + flash ───────────────────────────────────
  const virtualRowsRef = useRef(virtualRows);
  virtualRowsRef.current = virtualRows;

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const scrollToCard = (cardId: string) => {
    const rows = virtualRowsRef.current;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (
        row.kind === "cards" &&
        row.items.some((item) => item.id === cardId || item.printing.id === cardId)
      ) {
        virtualizerRef.current.scrollToIndex(i, { align: "auto" });
        return;
      }
    }
  };

  const [flashCardId, setFlashCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    scrollToCard(selectedItemId);
    setFlashCardId(selectedItemId);
    const timer = setTimeout(() => setFlashCardId(null), 800);
    return () => clearTimeout(timer);
  }, [selectedItemId]);

  // Re-scroll the selected card into view when columns change.
  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    scrollToCard(selectedItemId);
  }, [columns, selectedItemId]);

  // ── Helpers ────────────────────────────────────────────────────────
  const scrollToGroup = (setId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (r) => r.kind === "header" && r.set.id === setId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  const eagerCount = columns * 2;

  // ── Render ─────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {totalItems === 0 ? (
            <>
              <WifiOff className="size-10 opacity-50" />
              <p>Couldn&apos;t load cards</p>
              <p className="text-xs">The server may be unreachable.</p>
              <button
                type="button"
                className="mt-1 text-sm underline"
                onClick={() => globalThis.location.reload()}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <SearchX className="size-10 opacity-50" />
              <p>No cards found</p>
              <p className="text-xs">Try adjusting your filters.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <CardGridDebug
        enabled={debugOverlayEnabled}
        virtualizer={virtualizer}
        virtualRows={virtualRows}
        containerRef={containerRef}
        columns={columns}
        labelHeight={labelHeight}
        estimateRowHeight={estimateRowHeight}
      />

      <ScrollIndicator
        virtualRows={virtualRows}
        rowStarts={rowStarts}
        virtualizer={virtualizer}
        scrollMargin={scrollMargin}
        multipleGroups={multipleGroups}
      />

      {/* Sticky set header overlay */}
      <div className="sticky z-10 h-0" style={{ top: APP_HEADER_HEIGHT }}>
        {multipleGroups && activeHeaderRow && (
          <div className="flex justify-center pt-2">
            <SetHeaderLabel
              slug={activeHeaderRow.set.slug}
              name={activeHeaderRow.set.name}
              onClick={() => scrollToGroup(activeHeaderRow.set.id)}
              className="bg-background/60 ring-border/70 rounded-full px-3 py-1 shadow-sm ring-1 backdrop-blur"
            />
          </div>
        )}
      </div>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualItems.map((vItem) => {
          const row = virtualRows[vItem.index];
          if (!row) {
            return null;
          }

          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vItem.start - scrollMargin}px)`,
              }}
            >
              {row.kind === "header" ? (
                <HeaderRow row={row} onScrollToGroup={scrollToGroup} />
              ) : (
                <CardRowContent
                  row={row}
                  columns={columns}
                  labelHeight={labelHeight}
                  selectedItemId={selectedItemId}
                  flashCardId={flashCardId}
                  cardWidth={thumbWidth}
                  eagerCount={eagerCount}
                  renderCard={renderCard}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
