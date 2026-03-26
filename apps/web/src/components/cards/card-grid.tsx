import type { Printing } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useCardBrowserContext } from "@/components/card-browser-context";
import { useIsAdmin } from "@/hooks/use-admin";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
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
import type { SetInfo } from "./card-grid-types";
import { buildVirtualRows, groupCardsBySet } from "./card-grid-types";
import { CardThumbnail } from "./card-thumbnail";
import { ScrollIndicator } from "./scroll-indicator";
import { useGridKeyboardNav } from "./use-grid-keyboard-nav";
import { useStickyHeader } from "./use-sticky-header";

export type { SetInfo } from "./card-grid-types";

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

  const showImages = useDisplayStore((s) => s.showImages);
  const cardFields = useDisplayStore((s) => s.cardFields);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setPhysicalMax = useDisplayStore((s) => s.setPhysicalMax);
  const setPhysicalMin = useDisplayStore((s) => s.setPhysicalMin);
  const setAutoColumns = useDisplayStore((s) => s.setAutoColumns);

  const { data: isAdmin } = useIsAdmin();
  const { settings: adminSettings } = useAdminSettings();
  const debugOverlayEnabled = isAdmin === true && adminSettings.debugOverlay;

  const { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth } =
    useResponsiveColumns(maxColumns);

  useLayoutEffect(() => {
    setPhysicalMax(physicalMax);
    setPhysicalMin(physicalMin);
    setAutoColumns(autoColumns);
  }, [physicalMax, physicalMin, autoColumns, setPhysicalMax, setPhysicalMin, setAutoColumns]);

  const thumbWidth = (containerWidth - GAP * (columns - 1)) / columns;

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
      const aboveSm = containerWidth >= SM_BREAKPOINT;
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
      return FALLBACK_ROW_HEIGHT;
    }
    if (row.kind === "header") {
      return HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;
    }
    const imgHeight = (thumbWidth - BUTTON_PAD * 2) * CARD_ASPECT;
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
    const rowIndex = virtualRows.findIndex((r) => r.kind === "header" && r.set.id === setId);
    if (rowIndex !== -1) {
      virtualizer.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
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
        cardFields={cardFields}
        estimateSize={estimateSize}
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
                // ⚠ pt-4 / pb-2 are mirrored as HEADER_PT / HEADER_PB above — update both together
                <div className="flex items-center gap-3 pt-4 pb-2">
                  <div className="h-px flex-1 bg-border" />
                  <SetHeaderLabel
                    slug={row.set.slug}
                    name={row.set.name}
                    cardCount={row.cardCount}
                    onClick={() => scrollToGroup(row.set.id)}
                  />
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
    </div>
  );
}
