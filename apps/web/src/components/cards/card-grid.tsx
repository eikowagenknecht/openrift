import type { Printing } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useIsAdmin } from "@/hooks/use-admin";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { useDisplayStore } from "@/stores/display-store";

import {
  APP_HEADER_HEIGHT,
  BUTTON_PAD,
  CARD_ASPECT,
  COMPACT_THRESHOLD,
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
import type { SetInfo } from "./card-grid-types";
import { buildVirtualRows, groupCardsBySet } from "./card-grid-types";
import { CardThumbnail } from "./card-thumbnail";
import { useGridKeyboardNav } from "./use-grid-keyboard-nav";
import { useScrollIndicator } from "./use-scroll-indicator";
import { useStickyHeader } from "./use-sticky-header";

export type { SetInfo } from "./card-grid-types";

interface CardGridProps {
  cards: Printing[];
  totalCards: number;
  setOrder: SetInfo[];
  onCardClick: (printing: Printing) => void;
  onSiblingClick?: (printing: Printing) => void;
  selectedCardId?: string;
  keyboardNavCardId?: string;
  siblingPrintings?: Printing[];
  printingsByCardId?: Map<string, Printing[]>;
  priceRangeByCardId?: Map<string, { min: number; max: number }> | null;
  view?: "cards" | "printings";
  ownedCounts?: Map<string, number>;
  onAddCard?: (printing: Printing, anchorEl: HTMLElement) => void;
}

export function CardGrid({
  cards,
  totalCards,
  setOrder,
  onCardClick,
  onSiblingClick,
  selectedCardId,
  keyboardNavCardId,
  siblingPrintings,
  printingsByCardId,
  priceRangeByCardId,
  view,
  ownedCounts,
  onAddCard,
}: CardGridProps) {
  const showImages = useDisplayStore((s) => s.showImages);
  const cardFields = useDisplayStore((s) => s.cardFields);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setPhysicalMax = useDisplayStore((s) => s.setPhysicalMax);
  const setPhysicalMin = useDisplayStore((s) => s.setPhysicalMin);
  const setAutoColumns = useDisplayStore((s) => s.setAutoColumns);

  const { data: isAdmin } = useIsAdmin();
  const { settings: adminSettings } = useAdminSettings();
  const debugOverlayEnabled = isAdmin === true && adminSettings.debugOverlay;

  const { containerRef, columns, physicalMax, physicalMin, autoColumns } =
    useResponsiveColumns(maxColumns);

  useLayoutEffect(() => {
    setPhysicalMax(physicalMax);
  }, [physicalMax, setPhysicalMax]);

  useLayoutEffect(() => {
    setPhysicalMin(physicalMin);
  }, [physicalMin, setPhysicalMin]);

  useLayoutEffect(() => {
    setAutoColumns(autoColumns);
  }, [autoColumns, setAutoColumns]);

  const outerWidth = containerRef.current?.offsetWidth ?? 400;
  const thumbWidth = (outerWidth - GAP * (columns - 1)) / columns;

  const groups = groupCardsBySet(cards, setOrder);
  const multipleGroups = groups.length > 1;

  const virtualRows = buildVirtualRows(groups, columns, multipleGroups);

  // ── Label height estimation ────────────────────────────────────────
  const labelHeight = (() => {
    const f = cardFields ?? { number: true, title: true, type: true, rarity: true, price: true };
    const hasMetaFields = f.number || f.title || f.type || f.rarity;
    if (!hasMetaFields && !f.price) {
      return 0;
    }

    let h = LABEL_WRAPPER_MT;

    if (hasMetaFields) {
      h += META_LABEL_PY;
      const hasLine1 = f.number || f.title;
      const hasLine2 = f.type || f.rarity;
      const compact = thumbWidth < COMPACT_THRESHOLD;
      const aboveSm = globalThis.innerWidth >= SM_BREAKPOINT;
      const line1Height = !compact && aboveSm ? META_LINE_HEIGHT_SM : META_LINE_HEIGHT;
      if (hasLine1) {
        h += line1Height;
      }
      if (hasLine1 && hasLine2) {
        h += META_LINE_GAP;
      }
      if (hasLine2) {
        h += META_LINE_HEIGHT;
      }
    }

    if (f.price) {
      h += PRICE_MT + PRICE_LINE_HEIGHT;
    }

    return h;
  })();

  const estimateSize = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return 200;
    }
    if (row.kind === "header") {
      return HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;
    }
    const containerWidth = containerRef.current?.offsetWidth ?? 400;
    const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
    const imgHeight = (cardWidth - BUTTON_PAD * 2) * CARD_ASPECT;
    return Math.round(imgHeight + labelHeight + BUTTON_PAD * 2);
  };

  // Precompute cumulative start offsets for each row.
  const rowStarts = (() => {
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < virtualRows.length; i++) {
      starts.push(acc);
      acc += estimateSize(i) + GAP;
    }
    return starts;
  })();

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
    estimateSize,
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

  const {
    indicator,
    indicatorRef,
    cardIdRef,
    dragTopRef,
    isDraggingRef,
    handleIndicatorPointerDown,
    handleMoveRef,
    handleUpRef,
    handleMouseEnter,
    handleMouseLeave,
    snapPoints,
  } = useScrollIndicator({
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    multipleGroups,
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

  const [flashCardId, setFlashCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCardId) {
      return;
    }
    const rows = virtualRowsRef.current;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === "cards" && row.items.some((c) => c.id === selectedCardId)) {
        virtualizerRef.current.scrollToIndex(i, { align: "auto" });
        break;
      }
    }
    setFlashCardId(selectedCardId);
    const timer = setTimeout(() => setFlashCardId(null), 800);
    return () => clearTimeout(timer);
  }, [selectedCardId]);

  // Re-scroll the selected card into view when columns change.
  useEffect(() => {
    if (!selectedCardId) {
      return;
    }
    const rows = virtualRowsRef.current;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === "cards" && row.items.some((c) => c.id === selectedCardId)) {
        virtualizerRef.current.scrollToIndex(i, { align: "auto" });
        break;
      }
    }
  }, [columns, selectedCardId]);

  // ── Helpers ────────────────────────────────────────────────────────
  const scrollToGroup = (setName: string) => {
    const rowIndex = virtualRows.findIndex((r) => r.kind === "header" && r.set.name === setName);
    if (rowIndex !== -1) {
      virtualizer.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const items = virtualizer.getVirtualItems();

  // Cumulative card count per virtual row for eager-loading.
  const cardStartIndex = new Map<number, number>();
  let cardsBefore = 0;
  for (let i = 0; i < virtualRows.length; i++) {
    cardStartIndex.set(i, cardsBefore);
    const row = virtualRows[i];
    if (row.kind === "cards") {
      cardsBefore += row.items.length;
    }
  }
  const eagerCount = columns * 2;

  // ── Render ─────────────────────────────────────────────────────────
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
        cardFields={cardFields}
        estimateSize={estimateSize}
      />
      {cards.length === 0 ? (
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
      ) : (
        <>
          {/* Scroll position indicator — appears while scrolling, fades out after idle.
              Draggable: grab to scrub through the page; snaps to set headers on release. */}
          <div
            ref={indicatorRef}
            className={`fixed z-20 transition-opacity duration-300 ${indicator.visible ? "pointer-events-auto" : "pointer-events-none"} ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
            style={{
              right: 20,
              top: 0,
              transform: `translateY(calc(${indicator.dragging ? dragTopRef.current : indicator.indicatorTop}px - 50%))`,
              willChange: "transform",
              opacity: indicator.visible ? 1 : 0,
              touchAction: "none",
            }}
            onPointerDown={handleIndicatorPointerDown}
            onPointerMove={(e) => {
              if (isDraggingRef.current) {
                handleMoveRef.current(e.clientY);
              }
            }}
            onPointerUp={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onPointerCancel={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onLostPointerCapture={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div
              className={`flex origin-right items-center gap-1.5 transition-transform duration-200 ease-out ${indicator.dragging ? "scale-110" : "scale-100"}`}
            >
              <div
                className={`inline-flex items-center whitespace-nowrap rounded-md bg-popover/90 font-mono font-medium text-popover-foreground shadow-md ring-1 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-5 py-2 text-base" : "px-5 py-2 text-sm"} ${indicator.dragging ? "cursor-grabbing ring-primary/60" : "cursor-grab ring-primary/40"}`}
              >
                <span ref={cardIdRef}>{indicator.cardId || "\u00A0"}</span>
              </div>
              <div className="size-2 shrink-0 rounded-full bg-primary/70" />
            </div>
          </div>

          {/* Ghost badges — set-section marks, visible only while dragging */}
          {indicator.visible &&
            multipleGroups &&
            snapPoints.map((pt) => (
              <div
                key={pt.rowIndex}
                className={`pointer-events-none fixed z-19 transition-opacity duration-300 ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
                style={{
                  right: 20,
                  top: pt.screenY,
                  transform: "translateY(-50%)",
                  opacity: indicator.dragging ? 1 : 0,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`whitespace-nowrap rounded-md bg-popover/80 font-mono font-medium text-popover-foreground/70 ring-1 ring-border/50 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}
                  >
                    {pt.firstCardId || pt.setInfo.slug}
                  </div>
                  <div className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                </div>
              </div>
            ))}

          {/* Sticky set header overlay */}
          <div className="sticky z-10 h-0" style={{ top: APP_HEADER_HEIGHT }}>
            {multipleGroups && activeHeaderRow && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-2 rounded-full bg-background/95 px-3 py-1 shadow-sm ring-1 ring-border/50 backdrop-blur supports-[backdrop-filter]:bg-background/60"
                  onClick={() => scrollToGroup(activeHeaderRow.set.name)}
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {activeHeaderRow.set.slug}
                  </span>
                  <span className="text-sm font-semibold">{activeHeaderRow.set.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {activeHeaderRow.cardCount}
                  </span>
                </button>
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
                    // ⚠ pt-4 / pb-2 are mirrored as HEADER_PT / HEADER_PB above — update both together
                    <div className="flex items-center gap-3 pt-4 pb-2">
                      <div className="h-px flex-1 bg-border" />
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-2"
                        onClick={() => scrollToGroup(row.set.name)}
                      >
                        <span className="text-sm font-medium text-muted-foreground">
                          {row.set.slug}
                        </span>
                        <span className="text-sm font-semibold">{row.set.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {row.cardCount}
                        </span>
                      </button>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        gap: `${GAP}px`,
                      }}
                    >
                      {row.items.map((printing, colIndex) => {
                        const flatIndex = (cardStartIndex.get(vItem.index) ?? 0) + colIndex;
                        return (
                          <CardThumbnail
                            key={printing.id}
                            printing={printing}
                            onClick={onCardClick}
                            onSiblingClick={onSiblingClick}
                            showImages={showImages}
                            isSelected={printing.id === selectedCardId}
                            isFlashing={printing.id === flashCardId}
                            siblings={printingsByCardId?.get(printing.card.id)}
                            priceRange={priceRangeByCardId?.get(printing.card.id)}
                            view={view}
                            cardFields={cardFields}
                            cardWidth={thumbWidth}
                            priority={flatIndex < eagerCount}
                            ownedCount={ownedCounts?.get(printing.id)}
                            onAdd={onAddCard}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
