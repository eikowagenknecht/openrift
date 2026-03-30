import type { GroupByField, Printing } from "@openrift/shared";
import {
  ART_VARIANT_ORDER,
  CARD_TYPE_ORDER,
  DOMAIN_ORDER,
  RARITY_ORDER,
  SUPER_TYPE_ORDER,
} from "@openrift/shared";
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

const ART_VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  altart: "Alt Art",
  overnumbered: "Overnumbered",
};

function groupItemsBySet(
  items: CardViewerItem[],
  setOrder: GroupInfo[],
  printingsByCardId?: Map<string, Printing[]>,
): CardGroup[] {
  if (!printingsByCardId) {
    const bySet = Map.groupBy(items, (item) => item.printing.setId);
    return setOrder.flatMap((info) => {
      const setItems = bySet.get(info.id);
      return setItems ? [{ group: info, items: setItems }] : [];
    });
  }

  // When printingsByCardId is available (cards view), place each item in all
  // sets it has printings in, not just the canonical printing's set.
  const buckets = new Map<string, CardViewerItem[]>();
  for (const item of items) {
    const allPrintings = printingsByCardId.get(item.printing.card.id);
    const setIds = allPrintings
      ? [...new Set(allPrintings.map((printing) => printing.setId))]
      : [item.printing.setId];
    for (const setId of setIds) {
      const bucket = buckets.get(setId);
      if (bucket) {
        bucket.push(item);
      } else {
        buckets.set(setId, [item]);
      }
    }
  }
  return setOrder.flatMap((info) => {
    const setItems = buckets.get(info.id);
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
  printingsByCardId?: Map<string, Printing[]>,
): CardGroup[] {
  // For printing-level fields, collect unique values across all printings of a card.
  function allPrintingValues(
    item: CardViewerItem,
    getter: (printing: Printing) => string[],
  ): string[] {
    if (!printingsByCardId) {
      return getter(item.printing);
    }
    const allPrintings = printingsByCardId.get(item.printing.card.id);
    if (!allPrintings) {
      return getter(item.printing);
    }
    return [...new Set(allPrintings.flatMap((printing) => getter(printing)))];
  }

  const config: Record<
    typeof groupBy,
    {
      order: readonly string[];
      getKeys: (item: CardViewerItem) => string[];
      label?: (key: string) => string;
    }
  > = {
    type: {
      order: CARD_TYPE_ORDER,
      getKeys: (item) => [item.printing.card.type],
    },
    superType: {
      order: SUPER_TYPE_ORDER,
      getKeys: (item) => {
        const supers = item.printing.card.superTypes;
        return supers.length > 0 ? supers : ["(None)"];
      },
    },
    domain: {
      order: DOMAIN_ORDER,
      getKeys: (item) => {
        const doms = item.printing.card.domains;
        return doms.length > 0 ? doms : ["Colorless"];
      },
    },
    rarity: {
      order: RARITY_ORDER,
      getKeys: (item) => allPrintingValues(item, (printing) => [printing.rarity]),
    },
    artVariant: {
      order: ART_VARIANT_ORDER,
      getKeys: (item) => allPrintingValues(item, (printing) => [printing.artVariant]),
      label: (key) => ART_VARIANT_LABELS[key] ?? key,
    },
  };

  const { order, getKeys, label } = config[groupBy];

  // Build ordered entries including a catch-all for values not in the order array
  const allKeys = new Set<string>();
  const buckets = new Map<string, CardViewerItem[]>();
  for (const item of items) {
    for (const key of getKeys(item)) {
      allKeys.add(key);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        buckets.set(key, [item]);
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
  setOrder?: GroupInfo[],
  printingsByCardId?: Map<string, Printing[]>,
): CardGroup[] {
  if (groupBy === "none") {
    return [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  if (groupBy === "set") {
    return setOrder
      ? groupItemsBySet(items, setOrder, printingsByCardId)
      : [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  return groupItemsByField(items, groupBy, printingsByCardId);
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

/** All fields are always visible — height is constant. */
const LABEL_HEIGHT =
  LABEL_WRAPPER_MT + META_LABEL_PY + META_LINE_HEIGHT + META_LINE_GAP + META_LINE_HEIGHT;

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

function GroupHeaderLabel({
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
      {slug && <span className="text-muted-foreground font-medium">{slug}</span>}
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
  onScrollToGroup: (groupId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-2">
      <div className="bg-border h-px flex-1" />
      <GroupHeaderLabel
        slug={row.group.slug}
        name={row.group.name}
        onClick={() => onScrollToGroup(row.group.id)}
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
  /** All printings per card — enables correct grouping by printing-level fields in cards view. */
  printingsByCardId?: Map<string, Printing[]>;
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
  groupBy = "set",
  printingsByCardId,
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

  // ── Group items, then flatten into virtual rows ──────────────────
  const groups = buildGroups(items, groupBy, setOrder, printingsByCardId);
  const multipleGroups = groups.length > 1;
  const virtualRowsCacheRef = useRef<{
    items: CardViewerItem[];
    setOrder: GroupInfo[] | undefined;
    groupBy: GroupByField;
    printingsByCardId: Map<string, Printing[]> | undefined;
    columns: number;
    rows: VRow[];
  }>({
    items: [],
    setOrder: undefined,
    groupBy: "set",
    printingsByCardId: undefined,
    columns: 0,
    rows: [],
  });
  if (
    virtualRowsCacheRef.current.items !== items ||
    virtualRowsCacheRef.current.setOrder !== setOrder ||
    virtualRowsCacheRef.current.groupBy !== groupBy ||
    virtualRowsCacheRef.current.printingsByCardId !== printingsByCardId ||
    virtualRowsCacheRef.current.columns !== columns
  ) {
    virtualRowsCacheRef.current = {
      items,
      setOrder,
      groupBy,
      printingsByCardId,
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
      const viewportTop = globalThis.scrollY + APP_HEADER_HEIGHT;
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

  // ── Helpers ────────────────────────────────────────────────────────
  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (r) => r.kind === "header" && r.group.id === groupId,
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
            <GroupHeaderLabel
              slug={activeHeaderRow.group.slug}
              name={activeHeaderRow.group.name}
              onClick={() => scrollToGroup(activeHeaderRow.group.id)}
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
