import type { Printing } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useCardBrowserContext } from "@/components/card-browser-context";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import type { VisibleFields } from "@/lib/card-fields";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import {
  APP_HEADER_HEIGHT,
  BUTTON_PAD,
  CARD_ASPECT,
  COMPACT_THRESHOLD,
  FALLBACK_ROW_HEIGHT,
  GAP,
  HEADER_CONTENT_HEIGHT,
  HEADER_PB,
  HEADER_PT,
  LABEL_WRAPPER_MT,
  META_LABEL_PY,
  META_LINE_GAP,
  META_LINE_HEIGHT,
  META_LINE_HEIGHT_SM,
  PRICE_LINE_HEIGHT,
  PRICE_MT,
  SM_BREAKPOINT,
} from "./card-grid-constants";
import { CardGridDebug } from "./card-grid-debug";
import type { SetInfo, VRow } from "./card-grid-types";
import { CardThumbnail } from "./card-thumbnail";
import { ScrollIndicator } from "./scroll-indicator";
import { useGridKeyboardNav } from "./use-grid-keyboard-nav";
import { useStickyHeader } from "./use-sticky-header";

export type { SetInfo } from "./card-grid-types";

interface CardGroup {
  set: SetInfo;
  cards: Printing[];
}

function groupCardsBySet(cards: Printing[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = Map.groupBy(cards, (printing) => printing.setId);

  return setOrder.flatMap((setInfo) => {
    const setCards = bySet.get(setInfo.id);
    return setCards ? [{ set: setInfo, cards: setCards }] : [];
  });
}

function buildVirtualRows(groups: CardGroup[], columns: number): VRow[] {
  const showHeaders = groups.length > 1;
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", set: group.set, cardCount: group.cards.length });
    }
    for (let i = 0; i < group.cards.length; i += columns) {
      const items = group.cards.slice(i, i + columns);
      rows.push({ kind: "cards", items, cardsBefore });
      cardsBefore += items.length;
    }
  }
  return rows;
}

function estimateLabelHeight(
  visibleFields: VisibleFields | undefined,
  thumbWidth: number,
  containerWidth: number,
): number {
  const fields = visibleFields ?? {
    number: true,
    title: true,
    type: true,
    rarity: true,
    price: true,
  };
  const hasMetaFields = fields.number || fields.title || fields.type || fields.rarity;
  if (!hasMetaFields && !fields.price) {
    return 0;
  }

  let height = LABEL_WRAPPER_MT;

  if (hasMetaFields) {
    height += META_LABEL_PY;
    const hasLine1 = fields.number || fields.title;
    const hasLine2 = fields.type || fields.rarity;
    const compact = thumbWidth < COMPACT_THRESHOLD;
    const aboveSm = containerWidth >= SM_BREAKPOINT;
    const line1Height = !compact && aboveSm ? META_LINE_HEIGHT_SM : META_LINE_HEIGHT;
    if (hasLine1) {
      height += line1Height;
    }
    if (hasLine1 && hasLine2) {
      height += META_LINE_GAP;
    }
    if (hasLine2) {
      height += META_LINE_HEIGHT;
    }
  }

  if (fields.price) {
    height += PRICE_MT + PRICE_LINE_HEIGHT;
  }

  return height;
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

function SetHeaderLabel({
  slug,
  name,
  cardCount,
  onClick,
  className,
}: {
  slug: string;
  name: string;
  cardCount: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn("flex cursor-pointer flex-row gap-3 text-sm", className)}
      onClick={onClick}
    >
      <span className="font-medium text-muted-foreground">{slug}</span>
      <span className="font-semibold">{name}</span>
      <span className="text-muted-foreground">{cardCount}</span>
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
      <div className="h-px flex-1 bg-border" />
      <SetHeaderLabel
        slug={row.set.slug}
        name={row.set.name}
        cardCount={row.cardCount}
        onClick={() => onScrollToGroup(row.set.id)}
      />
      <div className="h-px flex-1 bg-border" />
    </div>
  );
});

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
const CardRowContent = memo(function CardRowContent({
  row,
  columns,
  labelHeight,
  onCardClick,
  onSiblingClick,
  showImages,
  selectedCardId,
  flashCardId,
  printingsByCardId,
  priceRangeByCardId,
  view,
  visibleFields,
  cardWidth,
  eagerCount,
  ownedCounts,
  onAdd,
}: {
  row: VRow & { kind: "cards" };
  columns: number;
  labelHeight: number;
  onCardClick: (printing: Printing) => void;
  onSiblingClick: (printing: Printing) => void;
  showImages: boolean;
  selectedCardId?: string;
  flashCardId: string | null;
  printingsByCardId: Map<string, Printing[]>;
  priceRangeByCardId: Map<string, { min: number; max: number }> | null;
  view: "cards" | "printings";
  visibleFields: VisibleFields;
  cardWidth: number;
  eagerCount: number;
  ownedCounts: Map<string, number> | undefined;
  onAdd?: (printing: Printing, anchorEl: HTMLElement) => void;
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
    if (globalThis.requestIdleCallback) {
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
        {row.items.map((printing) => (
          // ⚠ p-1.5 mirrors BUTTON_PAD in card-grid-constants — update both together
          <div key={printing.id} className="rounded-lg p-1.5">
            <div className="rounded-lg bg-muted/40" style={{ aspectRatio: `1 / ${CARD_ASPECT}` }} />
            {labelHeight > 0 && <div style={{ height: labelHeight }} />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      {row.items.map((printing, colIndex) => {
        const flatIndex = row.cardsBefore + colIndex;
        return (
          <CardThumbnail
            key={printing.id}
            printing={printing}
            onClick={onCardClick}
            onSiblingClick={onSiblingClick}
            showImages={showImages}
            isSelected={printing.id === selectedCardId}
            isFlashing={printing.id === flashCardId}
            siblings={printingsByCardId.get(printing.card.id)}
            priceRange={priceRangeByCardId?.get(printing.card.id)}
            view={view}
            visibleFields={visibleFields}
            cardWidth={cardWidth}
            priority={flatIndex < eagerCount}
            ownedCount={ownedCounts?.get(printing.id)}
            onAdd={onAdd}
          />
        );
      })}
    </div>
  );
});

interface CardGridProps {
  cards: Printing[];
  totalCards: number;
  setOrder: SetInfo[];
  selectedCardId?: string;
  keyboardNavCardId?: string;
}

export function CardGrid({
  cards,
  totalCards,
  setOrder,
  selectedCardId,
  keyboardNavCardId,
}: CardGridProps) {
  // ── Card data & interaction handlers (passed down to each CardThumbnail) ──
  const {
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    view,
    onCardClick,
    onSiblingClick,
    onAddCard,
    siblingPrintings,
  } = useCardBrowserContext();

  // ── Display preferences (what to show on each card) ──────────────
  const showImages = useDisplayStore((s) => s.showImages);
  const visibleFields = useDisplayStore((s) => s.visibleFields);
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

  // ── Group cards by set, then flatten into virtual rows ───────────
  const groups = groupCardsBySet(cards, setOrder);
  const multipleGroups = groups.length > 1;
  const virtualRowsCacheRef = useRef<{
    cards: Printing[];
    setOrder: SetInfo[];
    columns: number;
    rows: VRow[];
  }>({ cards: [], setOrder: [], columns: 0, rows: [] });
  if (
    virtualRowsCacheRef.current.cards !== cards ||
    virtualRowsCacheRef.current.setOrder !== setOrder ||
    virtualRowsCacheRef.current.columns !== columns
  ) {
    virtualRowsCacheRef.current = {
      cards,
      setOrder,
      columns,
      rows: buildVirtualRows(groups, columns),
    };
  }
  const virtualRows = virtualRowsCacheRef.current.rows;

  // ── Label height estimation ────────────────────────────────────────
  const labelHeight = estimateLabelHeight(visibleFields, thumbWidth, containerWidth);

  const estimateRowHeight = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return FALLBACK_ROW_HEIGHT;
    }
    if (row.kind === "header") {
      return HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;
    }
    const imgHeight = (thumbWidth - BUTTON_PAD * 2) * CARD_ASPECT;
    return Math.round(imgHeight + labelHeight + BUTTON_PAD * 2);
  };

  // Precompute cumulative start offsets for each row.
  const rowStarts = computeRowStarts(virtualRows, estimateRowHeight);

  // ── Scroll margin (container's document offset) ────────────────────
  const scrollMarginRef = useRef(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const newMargin = Math.round(el.getBoundingClientRect().top + globalThis.scrollY);
    if (newMargin !== scrollMarginRef.current) {
      scrollMarginRef.current = newMargin;
      setScrollMargin(newMargin);
    }
  }, [cards, containerRef]);

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
    selectedCardId: keyboardNavCardId ?? selectedCardId,
    virtualRows,
    columns,
    onCardClick,
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
      if (row.kind === "cards" && row.items.some((c) => c.id === cardId)) {
        virtualizerRef.current.scrollToIndex(i, { align: "auto" });
        return;
      }
    }
  };

  const [flashCardId, setFlashCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCardId) {
      return;
    }
    scrollToCard(selectedCardId);
    setFlashCardId(selectedCardId);
    const timer = setTimeout(() => setFlashCardId(null), 800);
    return () => clearTimeout(timer);
  }, [selectedCardId]);

  // Re-scroll the selected card into view when columns change.
  useEffect(() => {
    if (!selectedCardId) {
      return;
    }
    scrollToCard(selectedCardId);
  }, [columns, selectedCardId]);

  // ── Helpers ────────────────────────────────────────────────────────
  const scrollToGroup = (setId: string) => {
    const rowIndex = virtualRowsRef.current.findIndex(
      (r) => r.kind === "header" && r.set.id === setId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const items = virtualizer.getVirtualItems();

  const eagerCount = columns * 2;

  // ── Render ─────────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <div ref={containerRef}>
        <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
          {totalCards === 0 ? (
            <>
              <p className="text-lg font-medium text-muted-foreground">Couldn&apos;t load cards</p>
              <p className="text-sm text-muted-foreground">The server may be unreachable</p>
              <button
                type="button"
                className="mt-3 text-sm text-muted-foreground underline"
                onClick={() => globalThis.location.reload()}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-muted-foreground">No cards found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
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
        thumbWidth={thumbWidth}
        visibleFields={visibleFields}
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
              cardCount={activeHeaderRow.cardCount}
              onClick={() => scrollToGroup(activeHeaderRow.set.id)}
              className="rounded-full bg-background/60 px-3 py-1 ring-1 shadow-sm ring-border/70 backdrop-blur"
            />
          </div>
        )}
      </div>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {items.map((vItem) => {
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
                  onCardClick={onCardClick}
                  onSiblingClick={onSiblingClick}
                  showImages={showImages}
                  selectedCardId={selectedCardId}
                  flashCardId={flashCardId}
                  printingsByCardId={printingsByCardId}
                  priceRangeByCardId={priceRangeByCardId}
                  view={view}
                  visibleFields={visibleFields}
                  cardWidth={thumbWidth}
                  eagerCount={eagerCount}
                  ownedCounts={ownedCounts}
                  onAdd={onAddCard}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
