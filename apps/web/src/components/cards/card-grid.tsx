import type { GroupByField } from "@openrift/shared/types/search";
import type { ReactNode } from "react";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { OrnamentRule } from "@/components/ui/ornament";
import { Pressable } from "@/components/ui/pressable";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { useScopeEffect, useScopeLayoutEffect } from "@/hooks/use-scope-effect";
import {
  BUTTON_PAD,
  CARD_ASPECT_INVERSE,
  FALLBACK_ROW_HEIGHT,
  HEADER_CONTENT_HEIGHT,
  HEADER_PB,
  HEADER_PT,
  LABEL_HEIGHT,
} from "@/lib/card-grid-constants";
import { computeGridMetrics } from "@/lib/card-grid-metrics";
import type { GroupInfo } from "@/lib/card-group-types";
import { buildGroups } from "@/lib/card-groups";
import type { CardGroup } from "@/lib/card-groups";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import { cn } from "@/lib/utils";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { useDisplayStore } from "@/stores/display-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useGridViewportStore } from "@/stores/grid-viewport-store";

import { CardGridDebug } from "./card-grid-debug";
import type { VRow } from "./card-grid-types";
import { CardViewerEmptyState } from "./card-viewer-empty-state";
import { computeRowStarts } from "./compute-row-starts";
import { ScrollIndicator } from "./scroll-indicator";
import { useStickyHeader } from "./use-sticky-header";

// Module-level cache: persists the measured grid offset across re-mounts so
// SSR's 0 doesn't flash before the ResizeObserver corrects it.
let cachedScrollMargin = 0;

function buildVirtualRows(groups: CardGroup[], columns: number): VRow[] {
  const showHeaders = groups.length > 1;
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", group: group.group, cardCount: group.items.length });
    }
    for (let i = 0; i < group.items.length; i += columns) {
      const items = group.items.slice(i, i + columns);
      rows.push({ kind: "cards", items, cardsBefore });
      cardsBefore += items.length;
    }
  }
  return rows;
}

// Explicit memo + primitive `groupId` prop avoids minting a fresh onClick
// arrow every scroll tick, which would force this to re-render.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
const GroupHeaderLabel = memo(function GroupHeaderLabel({
  slug,
  name,
  groupId,
  onSelect,
  className,
}: {
  slug: string;
  name: string;
  groupId: string;
  onSelect: (groupId: string) => void;
  className?: string;
}) {
  return (
    <Pressable
      className={cn("flex flex-row gap-3 text-sm", className)}
      onClick={() => onSelect(groupId)}
    >
      {slug && <span className="text-muted-foreground font-medium">{slug}</span>}
      <span className="font-semibold">{name}</span>
    </Pressable>
  );
});

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
// ⚠ pt-4 / pb-2 are mirrored as HEADER_PT / HEADER_PB above — update both together
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
const HeaderRow = memo(function HeaderRow({
  row,
  onScrollToGroup,
}: {
  row: VRow & { kind: "header" };
  onScrollToGroup: (groupId: string) => void;
}) {
  return (
    <OrnamentRule fade="tips" className="pt-4 pb-2">
      <GroupHeaderLabel
        slug={row.group.slug}
        name={row.group.name}
        groupId={row.group.id}
        onSelect={onScrollToGroup}
      />
    </OrnamentRule>
  );
});

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
const CardRowContent = memo(function CardRowContent({
  row,
  columns,
  gap,
  labelHeight,
  addStripHeight,
  cardWidth,
  eagerCount,
  renderCard,
}: {
  row: VRow & { kind: "cards" };
  columns: number;
  gap: number;
  labelHeight: number;
  addStripHeight: number;
  cardWidth: number;
  eagerCount: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
}) {
  // Eager rows are SSR-preloaded by <FirstRowPreview>; skipping the deferred
  // placeholder phase for them avoids a flash before the cached image paints.
  const isEager = row.cardsBefore < eagerCount;
  const [deferred, setDeferred] = useState(!isEager);
  useEffect(() => {
    if (!deferred) {
      return;
    }
    // Safari has no requestIdleCallback; rAF + setTimeout approximates it.
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
    gap: `${gap}px`,
  };

  if (deferred) {
    return (
      <div style={gridStyle}>
        {row.items.map((item) => (
          // ⚠ p-0.75 mirrors BUTTON_PAD in card-grid-constants — update both together
          <div key={item.id} className="rounded-lg p-0.75">
            {addStripHeight > 0 && <div style={{ height: addStripHeight }} />}
            <div className="bg-muted aspect-card rounded-lg" />
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
        // Kept false here; each cell subscribes to useGridFocusStore by its
        // own itemId, keeping ctx stable so the per-cell memo can skip re-renders.
        return (
          <Fragment key={item.id}>
            {renderCard(item, {
              isSelected: false,
              isFlashing: false,
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
  setOrder?: GroupInfo[];
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  addStripHeight?: number;
  stickyOffset?: number;
  noResultsDescription?: ReactNode;
}

export function CardGrid({
  items,
  totalItems,
  renderCard,
  setOrder,
  collectionOrder,
  groupBy = "set",
  groupDir = "asc",
  selectedItemId,
  addStripHeight = 0,
  stickyOffset: stickyOffsetProp,
  noResultsDescription,
}: CardGridProps) {
  const { orders, labels } = useEnumOrders();
  // Resolved in the body, not as a default param: the live header
  // measurement settles after hydration and would mismatch SSR markup.
  const headerHeight = useHeaderHeight();
  const stickyOffset = stickyOffsetProp ?? headerHeight;

  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMeasurements = useGridViewportStore((s) => s.setMeasurements);

  const adminSettings = useAdminSettings();
  const debugOverlayEnabled = adminSettings?.debugOverlay === true;

  const {
    containerRef,
    containerEl,
    columns,
    physicalMax,
    physicalMin,
    autoColumns,
    containerWidth,
  } = useResponsiveColumns(maxColumns);

  useLayoutEffect(() => {
    setMeasurements({ physicalMax, physicalMin, autoColumns });
  }, [physicalMax, physicalMin, autoColumns, setMeasurements]);

  const { gap, cardWidth: thumbWidth } = computeGridMetrics(containerWidth, columns);

  const groups = buildGroups(items, groupBy, setOrder, groupDir, orders, labels, collectionOrder);
  const multipleGroups = groups.length > 1;

  const labelHeight = LABEL_HEIGHT;

  const virtualRows = buildVirtualRows(groups, columns);

  const estimateRowHeight = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return FALLBACK_ROW_HEIGHT;
    }
    if (row.kind === "header") {
      return HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;
    }
    const imgHeight = (thumbWidth - BUTTON_PAD * 2) * CARD_ASPECT_INVERSE;
    return Math.round(imgHeight + labelHeight + BUTTON_PAD * 2 + addStripHeight);
  };

  const rowStarts = computeRowStarts(virtualRows, estimateRowHeight, gap);

  const [scrollMargin, setScrollMargin] = useState(() => cachedScrollMargin);

  useLayoutEffect(() => {
    const el = containerEl;
    if (!el) {
      return;
    }
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().top + globalThis.scrollY);
      cachedScrollMargin = next;
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    // Observes body, not the container: catches toolbar/chip wrap above the grid too.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [containerEl]);

  const { virtualizer, virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: virtualRows.length,
    estimateSize: estimateRowHeight,
    gap,
    scrollMargin,
    scrollPaddingStart: stickyOffset,
    overscan: 3,
  });

  const activeHeaderRow = useStickyHeader({
    multipleGroups,
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    stickyOffset,
    headerHeight: HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB,
  });

  const virtualRowsRef = useRef(virtualRows);
  const virtualizerRef = useRef(virtualizer);
  const stickyOffsetRef = useRef(stickyOffset);

  useEffect(() => {
    virtualRowsRef.current = virtualRows;
    virtualizerRef.current = virtualizer;
    stickyOffsetRef.current = stickyOffset;
  });

  const scrollToCard = (cardId: string) => {
    const rows = virtualRowsRef.current;
    for (const [i, row] of rows.entries()) {
      if (
        row.kind === "cards" &&
        row.items.some((item) => item.id === cardId || item.printing.id === cardId)
      ) {
        const vItems = virtualizerRef.current.getVirtualItems();
        const vItem = vItems.find((vi) => vi.index === i);
        if (vItem) {
          const viewportTop = globalThis.scrollY + stickyOffsetRef.current;
          const viewportBottom = globalThis.scrollY + globalThis.innerHeight;
          const rowTop = vItem.start;
          const rowBottom = vItem.start + vItem.size;
          if (rowTop >= viewportTop && rowBottom <= viewportBottom) {
            return;
          }
        }
        virtualizerRef.current.scrollToIndex(i, { align: "start" });
        return;
      }
    }
  };

  useScopeEffect(selectedItemId, (itemId) => {
    if (!itemId) {
      useGridFocusStore.getState().setFlashCardId(null);
      return;
    }
    scrollToCard(itemId);
    useGridFocusStore.getState().setFlashCardId(itemId);
    const timer = setTimeout(() => useGridFocusStore.getState().setFlashCardId(null), 800);
    return () => clearTimeout(timer);
  });

  const topVisibleCardRef = useRef<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const rows = virtualRowsRef.current;
      const vItems = virtualizerRef.current.getVirtualItems();
      const viewportTop = globalThis.scrollY + stickyOffsetRef.current;
      for (const vItem of vItems) {
        const row = rows[vItem.index];
        if (row?.kind === "cards" && vItem.start + vItem.size > viewportTop) {
          topVisibleCardRef.current = row.items[0]?.id ?? null;
          return;
        }
      }
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, []);

  // react-virtual's estimateSize memo misses input changes that keep the row
  // count identical, leaving stale/mis-stacked row heights until measure() runs.
  const rowKindSignature = virtualRows.map((row) => (row.kind === "header" ? "h" : "c")).join("");
  useScopeLayoutEffect(`${rowKindSignature} ${columns} ${containerWidth} ${addStripHeight}`, () =>
    virtualizerRef.current.measure(),
  );

  useScopeEffect(`${columns} ${selectedItemId ?? ""}`, () => {
    const anchor = selectedItemId ?? topVisibleCardRef.current;
    if (anchor) {
      scrollToCard(anchor);
    }
  });

  // Reads only mirror refs, so the compiler keeps this reference stable and
  // HeaderRow's memo doesn't bust on every scroll tick.
  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (r) => r.kind === "header" && r.group.id === groupId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const eagerCount = columns;

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <CardViewerEmptyState totalItems={totalItems} noResultsDescription={noResultsDescription} />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <CardGridDebug
        enabled={debugOverlayEnabled}
        virtualizer={virtualizer}
        virtualRows={virtualRows}
        containerWidth={containerWidth}
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
        stickyOffset={stickyOffset}
      />

      <div className="sticky z-20 h-0" style={{ top: stickyOffset }}>
        {multipleGroups && activeHeaderRow && (
          <div className="pointer-events-none flex justify-center pt-2">
            <OrnamentRule fade="tips" className="w-72 max-w-full">
              <GroupHeaderLabel
                slug={activeHeaderRow.group.slug}
                name={activeHeaderRow.group.name}
                groupId={activeHeaderRow.group.id}
                onSelect={scrollToGroup}
                className={cn(
                  STICKY_SURFACE,
                  "ring-border/70 pointer-events-auto rounded-lg px-3 py-1 shadow-sm ring-1",
                )}
              />
            </OrnamentRule>
          </div>
        )}
      </div>
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
              className="has-[:hover]:z-10"
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
                  gap={gap}
                  labelHeight={labelHeight}
                  addStripHeight={addStripHeight}
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
