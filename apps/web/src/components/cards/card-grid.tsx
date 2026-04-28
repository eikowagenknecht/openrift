import type { EnumOrders, GroupByField, Printing } from "@openrift/shared";
import { SearchXIcon, WifiOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useEnumOrders } from "@/hooks/use-enums";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { cn } from "@/lib/utils";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
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
  LABEL_HEIGHT,
} from "./card-grid-constants";
import { CardGridDebug } from "./card-grid-debug";
import type { GroupInfo, VRow } from "./card-grid-types";
import { ScrollIndicator } from "./scroll-indicator";
import { useGridKeyboardNav } from "./use-grid-keyboard-nav";
import { useStickyHeader } from "./use-sticky-header";

export type { SetInfo } from "./card-grid-types";

interface CardGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

function groupItemsBySet(items: CardViewerItem[], setOrder: GroupInfo[]): CardGroup[] {
  const bySet = Map.groupBy(items, (item) => item.printing.setId);
  return setOrder.flatMap((info) => {
    const setItems = bySet.get(info.id);
    return setItems ? [{ group: info, items: setItems }] : [];
  });
}

interface OrderEntry {
  id: string;
  name: string;
}

function groupItemsByField(
  items: CardViewerItem[],
  groupBy: Exclude<GroupByField, "none" | "set">,
  orders: Omit<EnumOrders, "finishes">,
): CardGroup[] {
  interface FieldConfig {
    order: readonly string[];
    getKeysAndItems: (item: CardViewerItem) => { key: string; mapped: CardViewerItem }[];
    label?: (key: string) => string;
  }

  const config: Record<typeof groupBy, FieldConfig> = {
    type: {
      order: orders.cardTypes,
      getKeysAndItems: (item) => [{ key: item.printing.card.type, mapped: item }],
    },
    superType: {
      order: orders.superTypes,
      getKeysAndItems: (item) => {
        const supers = item.printing.card.superTypes;
        const keys = supers.length > 0 ? supers : ["(None)"];
        return keys.map((key) => ({ key, mapped: item }));
      },
    },
    domain: {
      order: orders.domains,
      getKeysAndItems: (item) => {
        const doms = item.printing.card.domains;
        const keys = doms.length > 0 ? doms : ["Colorless"];
        return keys.map((key) => ({ key, mapped: item }));
      },
    },
    rarity: {
      order: orders.rarities,
      getKeysAndItems: (item) => [{ key: item.printing.rarity, mapped: item }],
    },
  };

  const { order, getKeysAndItems, label } = config[groupBy];

  // Build ordered entries including a catch-all for values not in the order array
  const allKeys = new Set<string>();
  const buckets = new Map<string, CardViewerItem[]>();
  for (const item of items) {
    for (const { key, mapped } of getKeysAndItems(item)) {
      allKeys.add(key);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(mapped);
      } else {
        buckets.set(key, [mapped]);
      }
    }
  }

  const orderedEntries: OrderEntry[] = [];
  for (const key of order) {
    if (allKeys.has(key)) {
      orderedEntries.push({ id: key, name: label ? label(key) : key });
      allKeys.delete(key);
    }
  }
  // Append any remaining keys not in the predefined order
  for (const key of allKeys) {
    orderedEntries.push({ id: key, name: label ? label(key) : key });
  }

  return orderedEntries.flatMap((entry) => {
    const bucket = buckets.get(entry.id);
    return bucket ? [{ group: { id: entry.id, slug: "", name: entry.name }, items: bucket }] : [];
  });
}

function buildGroups(
  items: CardViewerItem[],
  groupBy: GroupByField,
  setOrder: GroupInfo[] | undefined,
  groupDir: "asc" | "desc",
  orders: EnumOrders,
): CardGroup[] {
  if (groupBy === "none") {
    return [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  let groups: CardGroup[];
  if (groupBy === "set") {
    groups = setOrder
      ? groupItemsBySet(items, setOrder)
      : [{ group: { id: "_all", slug: "", name: "" }, items }];
  } else {
    groups = groupItemsByField(items, groupBy, orders);
  }
  if (groupDir === "desc") {
    groups = groups.toReversed();
  }
  return groups;
}

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

// Explicit memo + primitive `groupId` prop: lets the two call sites pass a
// stable onSelect (scrollToGroup) instead of minting a fresh `() => scrollToGroup(id)`
// arrow on every CardGrid re-render. Without this, every scroll tick changed
// the onClick reference and forced GroupHeaderLabel to re-render.
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
    <button
      type="button"
      className={cn("flex cursor-pointer flex-row gap-3 text-sm", className)}
      onClick={() => onSelect(groupId)}
    >
      {slug && <span className="text-muted-foreground font-medium">{slug}</span>}
      <span className="font-semibold">{name}</span>
    </button>
  );
});

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
// ⚠ pt-4 / pb-2 are mirrored as HEADER_PT / HEADER_PB above — update both together
const HeaderRow = memo(function HeaderRow({
  row,
  onScrollToGroup,
}: {
  row: VRow & { kind: "header" };
  onScrollToGroup: (groupId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-2">
      <div className="bg-border h-px flex-1" />
      <GroupHeaderLabel
        slug={row.group.slug}
        name={row.group.name}
        groupId={row.group.id}
        onSelect={onScrollToGroup}
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
  addStripHeight,
  selectedItemId,
  flashCardId,
  cardWidth,
  eagerCount,
  renderCard,
}: {
  row: VRow & { kind: "cards" };
  columns: number;
  labelHeight: number;
  addStripHeight: number;
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
  // Eager rows (those containing priority/LCP cards) skip the deferred phase —
  // their images were preloaded by the SSR <FirstRowPreview>, so rendering the
  // muted-grey placeholder on hydration just adds a visible flash before the
  // cached image paints.
  const isEager = row.cardsBefore < eagerCount;
  const [deferred, setDeferred] = useState(!isEager);
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
            {addStripHeight > 0 && <div style={{ height: addStripHeight }} />}
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
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  keyboardNavItemId?: string;
  onItemClick?: (printing: Printing) => void;
  siblingPrintings?: Printing[];
  /** Extra height added to each card row (e.g. add-mode strip). */
  addStripHeight?: number;
  /** Total height of sticky elements above the grid (app header + toolbar). */
  stickyOffset?: number;
}

export function CardGrid({
  items,
  totalItems,
  renderCard,
  setOrder,
  groupBy = "set",
  groupDir = "asc",
  selectedItemId,
  keyboardNavItemId,
  onItemClick,
  siblingPrintings,
  addStripHeight = 0,
  stickyOffset = APP_HEADER_HEIGHT,
}: CardGridProps) {
  const { orders } = useEnumOrders();

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

  // ── Group items, then flatten into virtual rows ──────────────────
  const groups = buildGroups(items, groupBy, setOrder, groupDir, orders);
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
    const imgHeight = (thumbWidth - BUTTON_PAD * 2) * CARD_ASPECT;
    return Math.round(imgHeight + labelHeight + BUTTON_PAD * 2 + addStripHeight);
  };

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
  const { virtualizer, virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: virtualRows.length,
    estimateSize: estimateRowHeight,
    gap: GAP,
    scrollMargin,
    scrollPaddingStart: stickyOffset,
    overscan: 3,
  });

  // ── Extracted hooks ────────────────────────────────────────────────
  const activeHeaderRow = useStickyHeader({
    multipleGroups,
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    stickyOffset,
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

  // Track the first visible card so we can anchor scroll when columns change.
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

  // Invalidate the virtualizer's measurement cache when columns change so
  // scrollToIndex uses fresh estimates instead of stale heights from the
  // previous column layout.
  const prevColumnsRef = useRef(columns);
  useEffect(() => {
    if (prevColumnsRef.current !== columns) {
      prevColumnsRef.current = columns;
      virtualizerRef.current.measure();
    }
  }, [columns]);

  // Re-scroll when columns change: anchor to selected card or first visible card.
  useEffect(() => {
    const anchor = selectedItemId ?? topVisibleCardRef.current;
    if (!anchor) {
      return;
    }
    scrollToCard(anchor);
  }, [columns, selectedItemId]);

  // Reads only from mirror refs, so the React Compiler memoizes this to a
  // stable reference — HeaderRow's onScrollToGroup prop stays equal across
  // scroll-driven re-renders and its memo doesn't bust on every tick.
  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (r) => r.kind === "header" && r.group.id === groupId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const eagerCount = columns;

  // ── Render ─────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {totalItems === 0 ? (
            <>
              <WifiOffIcon className="size-10 opacity-50" />
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
              <SearchXIcon className="size-10 opacity-50" />
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
        stickyOffset={stickyOffset}
      />

      {/* Sticky set header overlay */}
      <div className="sticky z-20 h-0" style={{ top: stickyOffset }}>
        {multipleGroups && activeHeaderRow && (
          <div className="flex justify-center pt-2">
            <GroupHeaderLabel
              slug={activeHeaderRow.group.slug}
              name={activeHeaderRow.group.name}
              groupId={activeHeaderRow.group.id}
              onSelect={scrollToGroup}
              className="bg-background/60 ring-border/70 rounded-full px-3 py-1 shadow-sm ring-1 backdrop-blur"
            />
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
                  labelHeight={labelHeight}
                  addStripHeight={addStripHeight}
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
